import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { UAParser } from 'ua-parser-js';
import { uniqueNamesGenerator, adjectives, animals, colors } from 'unique-names-generator';

export type Peer = {
  id: string;
  name: string;
  device: string;
};

export type Message = {
  id: string;
  senderId: string;
  type: 'text' | 'file-offer' | 'file-accept' | 'file-reject' | 'file-start' | 'file-end';
  text?: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
};

export type FileTransfer = {
  id: string;
  senderId: string;
  name: string;
  size: number;
  mimeType: string;
  progress: number;
  status: 'offered' | 'transferring' | 'completed' | 'rejected';
  buffer?: ArrayBuffer[];
  receivedSize?: number;
};

const CHUNK_SIZE = 16 * 1024; // 16KB

export function useWebRTC() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [me, setMe] = useState<Peer | null>(null);
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [transfers, setTransfers] = useState<Record<string, FileTransfer>>({});
  
  const rtcConnections = useRef<Record<string, RTCPeerConnection>>({});
  const dataChannels = useRef<Record<string, RTCDataChannel>>({});
  const pendingFiles = useRef<Record<string, File>>({});
  const currentFileIdMap = useRef<Record<string, string | null>>({});

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    }, 10000);
  }, []);

  const removeMessage = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const updateTransfer = useCallback((id: string, update: Partial<FileTransfer>) => {
    setTransfers((prev) => {
      if (!prev[id]) return prev;
      return {
        ...prev,
        [id]: { ...prev[id], ...update },
      };
    });
  }, []);

  const sendFileData = useCallback((peerId: string, fileId: string, myId: string) => {
    const dc = dataChannels.current[peerId];
    const file = pendingFiles.current[fileId];
    
    if (!dc || dc.readyState !== 'open' || !file) return;

    const startMsg: Message = { id: uuidv4(), senderId: myId, type: 'file-start', fileId };
    dc.send(JSON.stringify(startMsg));

    let offset = 0;
    const reader = new FileReader();

    const readSlice = (o: number) => {
      const slice = file.slice(o, o + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      if (e.target && e.target.result) {
        // Wait for buffer to drain if it's too full
        if (dc.bufferedAmount > dc.bufferedAmountLowThreshold) {
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            sendChunk(e.target!.result as ArrayBuffer);
          };
        } else {
          sendChunk(e.target.result as ArrayBuffer);
        }
      }
    };

    const sendChunk = (chunk: ArrayBuffer) => {
      dc.send(chunk);
      offset += chunk.byteLength;
      
      updateTransfer(fileId, { progress: Math.round((offset / file.size) * 100) });

      if (offset < file.size) {
        readSlice(offset);
      } else {
        const endMsg: Message = { id: uuidv4(), senderId: myId, type: 'file-end', fileId };
        dc.send(JSON.stringify(endMsg));
        updateTransfer(fileId, { status: 'completed', progress: 100 });
        delete pendingFiles.current[fileId];
      }
    };

    // Set a reasonable threshold
    dc.bufferedAmountLowThreshold = 65536; // 64KB
    readSlice(0);
  }, [updateTransfer]);

  useEffect(() => {
    const parser = new UAParser();
    const result = parser.getResult();
    const os = result.os.name || 'Unknown OS';
    const browser = result.browser.name || 'Unknown Browser';
    const deviceName = `${browser} on ${os}`;

    const randomName = uniqueNamesGenerator({
      dictionaries: [adjectives, colors, animals],
      separator: ' ',
      style: 'capital',
    });

    const newSocket = io({
      path: '/socket.io',
    });

    setSocket(newSocket);

    let myId = '';

    const setupDataChannel = (peerId: string, dc: RTCDataChannel) => {
      dataChannels.current[peerId] = dc;
      dc.binaryType = 'arraybuffer';

      dc.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data) as Message;
          
          if (msg.type === 'text') {
            addMessage(msg);
          } else if (msg.type === 'file-offer') {
            setTransfers((prev) => ({
              ...prev,
              [msg.fileId!]: {
                id: msg.fileId!,
                senderId: msg.senderId,
                name: msg.fileName!,
                size: msg.fileSize!,
                mimeType: msg.fileMimeType!,
                progress: 0,
                status: 'offered',
                buffer: [],
                receivedSize: 0,
              },
            }));
          } else if (msg.type === 'file-accept') {
            updateTransfer(msg.fileId!, { status: 'transferring' });
            sendFileData(peerId, msg.fileId!, myId);
          } else if (msg.type === 'file-reject') {
            updateTransfer(msg.fileId!, { status: 'rejected' });
          } else if (msg.type === 'file-start') {
            currentFileIdMap.current[peerId] = msg.fileId!;
            updateTransfer(msg.fileId!, { status: 'transferring' });
          } else if (msg.type === 'file-end') {
            setTransfers((prev) => {
              const transfer = prev[msg.fileId!];
              if (transfer && transfer.buffer) {
                const blob = new Blob(transfer.buffer, { type: transfer.mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = transfer.name;
                a.click();
                URL.revokeObjectURL(url);
              }
              return {
                ...prev,
                [msg.fileId!]: { ...transfer, status: 'completed', progress: 100 },
              };
            });
            currentFileIdMap.current[peerId] = null;
          }
        } else if (event.data instanceof ArrayBuffer) {
          const currentFileId = currentFileIdMap.current[peerId];
          if (currentFileId) {
            setTransfers((prev) => {
              const transfer = prev[currentFileId];
              if (!transfer) return prev;
              
              const newReceivedSize = (transfer.receivedSize || 0) + event.data.byteLength;
              const progress = Math.round((newReceivedSize / transfer.size) * 100);
              
              return {
                ...prev,
                [currentFileId]: {
                  ...transfer,
                  buffer: [...(transfer.buffer || []), event.data],
                  receivedSize: newReceivedSize,
                  progress,
                },
              };
            });
          }
        }
      };
    };

    const createPeerConnection = (peerId: string) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      rtcConnections.current[peerId] = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          newSocket.emit('signal', { to: peerId, signal: event.candidate });
        }
      };

      pc.ondatachannel = (event) => {
        setupDataChannel(peerId, event.channel);
      };

      return pc;
    };

    const initiateConnection = async (peerId: string) => {
      const pc = createPeerConnection(peerId);
      const dc = pc.createDataChannel('data');
      setupDataChannel(peerId, dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      newSocket.emit('signal', { to: peerId, signal: offer });
    };

    newSocket.on('connect', () => {
      myId = newSocket.id!;
      const myData = { name: randomName, device: deviceName };
      setMe({ id: myId, ...myData });
      newSocket.emit('join', myData);
    });

    newSocket.on('peers', (existingPeers: Peer[]) => {
      const peersMap: Record<string, Peer> = {};
      existingPeers.forEach((p) => {
        peersMap[p.id] = p;
        initiateConnection(p.id);
      });
      setPeers(peersMap);
    });

    newSocket.on('peer-joined', (peer: Peer) => {
      setPeers((prev) => ({ ...prev, [peer.id]: peer }));
      // Wait for the new peer to initiate the connection
    });

    newSocket.on('peer-left', (peerId: string) => {
      setPeers((prev) => {
        const newPeers = { ...prev };
        delete newPeers[peerId];
        return newPeers;
      });
      if (rtcConnections.current[peerId]) {
        rtcConnections.current[peerId].close();
        delete rtcConnections.current[peerId];
      }
      if (dataChannels.current[peerId]) {
        dataChannels.current[peerId].close();
        delete dataChannels.current[peerId];
      }
    });

    newSocket.on('signal', async (data: { from: string; signal: any }) => {
      const { from, signal } = data;
      let pc = rtcConnections.current[from];

      if (!pc) {
        pc = createPeerConnection(from);
      }

      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        newSocket.emit('signal', { to: from, signal: answer });
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal));
      }
    });

    return () => {
      newSocket.disconnect();
      Object.values(rtcConnections.current).forEach((pc) => pc.close());
    };
  }, [addMessage, updateTransfer, sendFileData]);

  const sendText = useCallback((peerId: string, text: string) => {
    const dc = dataChannels.current[peerId];
    if (dc && dc.readyState === 'open' && me) {
      const msg: Message = { id: uuidv4(), senderId: me.id, type: 'text', text };
      dc.send(JSON.stringify(msg));
      addMessage(msg);
    }
  }, [me, addMessage]);

  const offerFile = useCallback((peerId: string, file: File) => {
    const dc = dataChannels.current[peerId];
    if (dc && dc.readyState === 'open' && me) {
      const fileId = uuidv4();
      pendingFiles.current[fileId] = file;
      
      const msg: Message = {
        id: uuidv4(),
        senderId: me.id,
        type: 'file-offer',
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileMimeType: file.type,
      };
      
      setTransfers((prev) => ({
        ...prev,
        [fileId]: {
          id: fileId,
          senderId: me.id,
          name: file.name,
          size: file.size,
          mimeType: file.type,
          progress: 0,
          status: 'offered',
        },
      }));

      dc.send(JSON.stringify(msg));
    }
  }, [me]);

  const acceptFile = useCallback((peerId: string, fileId: string) => {
    const dc = dataChannels.current[peerId];
    if (dc && dc.readyState === 'open' && me) {
      const msg: Message = { id: uuidv4(), senderId: me.id, type: 'file-accept', fileId };
      dc.send(JSON.stringify(msg));
      updateTransfer(fileId, { status: 'transferring' });
    }
  }, [me, updateTransfer]);

  const rejectFile = useCallback((peerId: string, fileId: string) => {
    const dc = dataChannels.current[peerId];
    if (dc && dc.readyState === 'open' && me) {
      const msg: Message = { id: uuidv4(), senderId: me.id, type: 'file-reject', fileId };
      dc.send(JSON.stringify(msg));
      updateTransfer(fileId, { status: 'rejected' });
    }
  }, [me, updateTransfer]);

  return {
    me,
    peers,
    messages,
    transfers,
    sendText,
    offerFile,
    acceptFile,
    rejectFile,
    removeMessage,
  };
}
