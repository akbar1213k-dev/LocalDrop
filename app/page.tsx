'use client';

import { useState, useRef, useEffect } from 'react';
import { useWebRTC, Peer, Message, FileTransfer } from '@/hooks/useWebRTC';
import { Monitor, Smartphone, Laptop, Download, X, Send, Moon, Sun, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Home() {
  const { me, peers, messages, transfers, sendText, offerFile, acceptFile, rejectFile, removeMessage } = useWebRTC();
  const [darkMode, setDarkMode] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [messageText, setMessageText] = useState('');
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handlePeerClick = (peer: Peer) => {
    setSelectedPeer(peer);
    fileInputRef.current?.click();
  };

  const handlePeerContextMenu = (e: React.MouseEvent, peer: Peer) => {
    e.preventDefault();
    setSelectedPeer(peer);
    setIsMessageModalOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedPeer) {
      offerFile(selectedPeer.id, file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageText.trim() && selectedPeer) {
      sendText(selectedPeer.id, messageText);
      setMessageText('');
      setIsMessageModalOpen(false);
    }
  };

  const getDeviceIcon = (device: string) => {
    const lower = device.toLowerCase();
    if (lower.includes('mobile') || lower.includes('android') || lower.includes('ios')) {
      return <Smartphone className="w-8 h-8" />;
    }
    if (lower.includes('mac') || lower.includes('windows') || lower.includes('linux')) {
      return <Laptop className="w-8 h-8" />;
    }
    return <Monitor className="w-8 h-8" />;
  };

  const pendingTransfers = Object.values(transfers).filter(
    (t) => t.status === 'offered' && t.senderId !== me?.id
  );

  const activeTransfers = Object.values(transfers).filter(
    (t) => t.status === 'transferring'
  );

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <header className="p-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/30">
            L
          </div>
          <h1 className="text-2xl font-bold tracking-tight">LocalDrop</h1>
        </div>
        <button
          onClick={() => setDarkMode(!darkMode)}
          className={`p-2 rounded-full transition-colors ${darkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-slate-100 shadow-sm'}`}
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      <main className="max-w-7xl mx-auto p-6 flex flex-col items-center justify-center min-h-[70vh]">
        {!me ? (
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-lg font-medium opacity-70">Connecting to local network...</p>
          </div>
        ) : (
          <>
            <div className="mb-16 text-center">
              <div className="inline-flex items-center justify-center p-4 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 mb-4">
                {getDeviceIcon(me.device)}
              </div>
              <h2 className="text-2xl font-bold">{me.name}</h2>
              <p className="opacity-60 text-sm mt-1">You are known as</p>
            </div>

            <div className="w-full max-w-4xl relative">
              {Object.keys(peers).length === 0 ? (
                <div className="text-center p-12 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700">
                  <Info className="w-12 h-12 mx-auto mb-4 opacity-40" />
                  <h3 className="text-xl font-medium mb-2">No other devices found</h3>
                  <p className="opacity-60 max-w-md mx-auto">
                    Open LocalDrop on another device on the same Wi-Fi network to start sharing files and messages.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap justify-center gap-8">
                  <AnimatePresence>
                    {Object.values(peers).map((peer) => {
                      const peerTransfers = activeTransfers.filter(t => t.senderId === peer.id || (t.senderId === me.id && transfers[t.id]?.status === 'transferring'));
                      const activeTransfer = peerTransfers[0];

                      return (
                        <motion.div
                          key={peer.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="relative group cursor-pointer"
                          onClick={() => handlePeerClick(peer)}
                          onContextMenu={(e) => handlePeerContextMenu(e, peer)}
                        >
                          <div className={`flex flex-col items-center p-6 rounded-3xl transition-all duration-300 ${darkMode ? 'bg-slate-800 hover:bg-slate-700' : 'bg-white hover:bg-slate-50 shadow-md hover:shadow-lg'}`}>
                            <div className="relative w-20 h-20 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900 mb-4 group-hover:scale-110 transition-transform">
                              {activeTransfer ? (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" className="opacity-20" />
                                    <circle 
                                      cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="4" 
                                      strokeDasharray={`${2 * Math.PI * 45}`}
                                      strokeDashoffset={`${2 * Math.PI * 45 * (1 - activeTransfer.progress / 100)}`}
                                      className="text-indigo-500 transition-all duration-300"
                                    />
                                  </svg>
                                  <span className="absolute text-xs font-bold">{activeTransfer.progress}%</span>
                                </div>
                              ) : (
                                getDeviceIcon(peer.device)
                              )}
                            </div>
                            <h3 className="font-semibold text-center">{peer.name}</h3>
                            <p className="text-xs opacity-60 text-center mt-1">{peer.device}</p>
                            
                            <div className="absolute -top-3 -right-3 bg-indigo-500 text-white text-xs px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-md">
                              Click to send file<br/>Right-click to message
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Incoming File Modals */}
      <AnimatePresence>
        {pendingTransfers.map((transfer) => {
          const sender = peers[transfer.senderId];
          return (
            <motion.div
              key={transfer.id}
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed bottom-6 right-6 max-w-sm w-full bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700 z-50"
            >
              <div className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Download className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg">{sender?.name || 'Someone'} wants to send you a file</h4>
                    <p className="text-sm opacity-70 mt-1 truncate" title={transfer.name}>
                      {transfer.name}
                    </p>
                    <p className="text-xs opacity-50 mt-1">
                      {(transfer.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => rejectFile(transfer.senderId, transfer.id)}
                    className="flex-1 py-2 px-4 rounded-xl font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => acceptFile(transfer.senderId, transfer.id)}
                    className="flex-1 py-2 px-4 rounded-xl font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Message Modal */}
      <AnimatePresence>
        {isMessageModalOpen && selectedPeer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setIsMessageModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                <h3 className="font-semibold text-lg">Message {selectedPeer.name}</h3>
                <button
                  onClick={() => setIsMessageModalOpen(false)}
                  className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSendMessage} className="p-6">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message or paste a link..."
                  className="w-full h-32 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none transition-all"
                  autoFocus
                />
                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={!messageText.trim()}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    Send
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Received Messages Toast */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3">
        <AnimatePresence>
          {messages.filter(m => m.senderId !== me?.id).slice(-3).map((msg) => {
            const sender = peers[msg.senderId];
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 max-w-sm w-full"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-semibold text-sm text-indigo-600 dark:text-indigo-400">
                    {sender?.name || 'Someone'}
                  </span>
                  <button 
                    onClick={() => removeMessage(msg.id)}
                    className="opacity-50 hover:opacity-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm break-words whitespace-pre-wrap">{msg.text}</p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

    </div>
  );
}
