// network.js - Peer-to-peer networking module

// --- NETWORK MODULE ---
const Network = {
  // Configuration
  BASE_PEER_ID: 'NeonGameBootstrap-2025-001',
  LOBBY_SIZE: 2, // Change this value to set the number of players required before islanding
  
  // Private state
  myPeerId: null,
  peer: null,
  isBase: false,
  paired: false,
  partnerPeerId: null,
  partnerConn: null,
  isInitialized: false,
  basePeerConnections: {},
  baseConn: null,
  basePeer: null, // Store reference to the BASE_PEER_ID peer instance
  isDiscoveryBasePeer: false, // Track if basePeer is only for discovery
  lobbyPeers: [], // Array to store all peers in current lobby
  partnerConnections: {}, // Object to store connections to all lobby partners
  lobbyConnectedPeers: [], // Track all connected peers including host
  lobbyPeerConnections: {}, // Track all peer connections for lobby
  lobbyFull: false, // Track if lobby is complete
  retryCount: 0, // Track retry attempts
  maxRetries: 5, // Maximum retry attempts before giving up
  
  // Callback functions for UI integration
  callbacks: {
    updateConnectionStatus: null,
    logChainEvent: null,
    updateUI: null,
    handleMessage: null
  },
  
  // Set callback functions
  setCallbacks(callbacks) {
    this.callbacks = { ...this.callbacks, ...callbacks };
  },
  
  // Initialize the network
  init() {
    console.log('[Network] Starting initialization...');
    this.myPeerId = `ChainNode-${Math.random().toString(36).substr(2, 8)}`;
    this.peer = new Peer(this.myPeerId, {
      host: '0.peerjs.com', port: 443, path: '/', secure: true,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });
    
    this.peer.on('open', (id) => {
      console.log('[Network] Peer opened with ID:', id);
      this.isInitialized = true;
      if (this.callbacks.updateConnectionStatus) {
        this.callbacks.updateConnectionStatus(`Connected as ${this.myPeerId}`);
      }
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Peer] Initialized: ${this.myPeerId}`);
      }
      if (this.callbacks.updateUI) {
        this.callbacks.updateUI();
      }
      this.tryBecomeBase();
    });

    this.peer.on('connection', (conn) => {
      // Handle different types of connections based on current state
      if (this.isBase) {
        // We are the host - handle direct client connections
        conn.on('data', (data) => {
          if (data.type === 'join_host') {
            if (this.callbacks.logChainEvent) {
              this.callbacks.logChainEvent(`[Host] Received join_host request from ${data.peerId}`);
              this.callbacks.logChainEvent(`[Host] Current lobby state: ${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE} players, lobbyFull: ${this.lobbyFull}`);
              this.callbacks.logChainEvent(`[Host] Current players: [${this.lobbyConnectedPeers.join(', ')}]`);
              this.callbacks.logChainEvent(`[Host] Checking if ${data.peerId} is already in lobby: ${this.lobbyConnectedPeers.includes(data.peerId)}`);
            }
            
            // Direct connection to host - double check lobby status
            if (this.lobbyFull || this.lobbyConnectedPeers.length >= this.LOBBY_SIZE) {
              if (this.callbacks.logChainEvent) {
                this.callbacks.logChainEvent(`[Host] Lobby already complete (${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE}), rejecting ${data.peerId}`);
              }
              conn.send({
                type: 'lobby_full',
                message: 'Lobby is full, try starting your own lobby'
              });
              conn.close();
              return;
            }
            if (this.lobbyConnectedPeers.length < this.LOBBY_SIZE) {
              // Check if this peer is already in the lobby to prevent duplicates
              if (this.lobbyConnectedPeers.includes(data.peerId)) {
                if (this.callbacks.logChainEvent) {
                  this.callbacks.logChainEvent(`[Host] Player ${data.peerId} is already in lobby, ignoring duplicate join`);
                }
                // Still send waiting notification since they're already connected
                conn.send({ 
                  type: 'waiting', 
                  current: this.lobbyConnectedPeers.length, 
                  total: this.LOBBY_SIZE,
                  message: `Already connected - waiting for ${this.LOBBY_SIZE - this.lobbyConnectedPeers.length} more player${this.LOBBY_SIZE - this.lobbyConnectedPeers.length !== 1 ? 's' : ''}`
                });
                return;
              }
              
              this.lobbyConnectedPeers.push(data.peerId);
              this.lobbyPeerConnections[data.peerId] = conn;
              this.basePeerConnections[data.peerId] = conn;
              
              if (this.callbacks.logChainEvent) {
                this.callbacks.logChainEvent(`[Host] Player ${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE} joined: ${data.peerId}`);
                this.callbacks.logChainEvent(`[Host] Current players: ${this.lobbyConnectedPeers.join(', ')}`);
              }
              if (this.callbacks.updateConnectionStatus) {
                this.callbacks.updateConnectionStatus(`Waiting for ${this.LOBBY_SIZE} players... (${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE})`);
              }
              
              // Update UI to show current state
              if (this.callbacks.updateUI) {
                this.callbacks.updateUI();
              }
              
              // Check if we have all players (MUST be exactly LOBBY_SIZE)
              if (this.lobbyConnectedPeers.length === this.LOBBY_SIZE) {
                // Mark lobby as full to prevent more joins
                this.lobbyFull = true;
                
                if (this.callbacks.logChainEvent) {
                  this.callbacks.logChainEvent(`[Host] Lobby full! ${this.LOBBY_SIZE} players total: ${this.lobbyConnectedPeers.join(', ')}`);
                  this.callbacks.logChainEvent(`[Host] This includes: 1 host + ${this.lobbyConnectedPeers.length - 1} clients`);
                }
                
                // Base becomes the permanent host - store all client connections
                this.lobbyPeers = this.lobbyConnectedPeers.slice(1); // All clients except host
                this.partnerConnections = { ...this.lobbyPeerConnections }; // Store all client connections
                this.paired = true;
                
                // Notify all clients that the lobby is ready and they're connected to host
                for (let i = 1; i < this.lobbyConnectedPeers.length; i++) {
                  const peerId = this.lobbyConnectedPeers[i];
                  if (this.lobbyPeerConnections[peerId]) {
                    this.lobbyPeerConnections[peerId].send({ 
                      type: 'host_ready', 
                      hostId: this.myPeerId,
                      allPlayers: this.lobbyConnectedPeers 
                    });
                    if (this.callbacks.logChainEvent) {
                      this.callbacks.logChainEvent(`[Host] Sent host_ready to client: ${peerId}`);
                    }
                  }
                }
                
                if (this.callbacks.updateConnectionStatus) {
                  this.callbacks.updateConnectionStatus(`Hosting ${this.LOBBY_SIZE}-player lobby! (1 host + ${this.lobbyConnectedPeers.length - 1} clients)`);
                }
                if (this.callbacks.logChainEvent) {
                  this.callbacks.logChainEvent(`[Host] Now hosting ${this.LOBBY_SIZE} players as central host!`);
                }
                if (this.callbacks.updateUI) {
                  this.callbacks.updateUI();
                }
                
                // Now that lobby is full, release the BASE_PEER_ID so others can start new lobbies
                if (this.callbacks.logChainEvent) {
                  this.callbacks.logChainEvent(`[Host] Releasing BASE_PEER_ID to allow new lobbies to form`);
                }
                this.basePeer.destroy(); // Release the BASE_PEER_ID for others to use
              } else {
                // Not enough players yet, send waiting notification
                conn.send({ 
                  type: 'waiting', 
                  current: this.lobbyConnectedPeers.length, 
                  total: this.LOBBY_SIZE,
                  message: `Waiting for ${this.LOBBY_SIZE - this.lobbyConnectedPeers.length} more player${this.LOBBY_SIZE - this.lobbyConnectedPeers.length !== 1 ? 's' : ''}`
                });
                
                if (this.callbacks.logChainEvent) {
                  this.callbacks.logChainEvent(`[Host] Still waiting for ${this.LOBBY_SIZE - this.lobbyConnectedPeers.length} more player${this.LOBBY_SIZE - this.lobbyConnectedPeers.length !== 1 ? 's' : ''}... Current: ${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE}`);
                }
              }
            } else {
              // Lobby is full, reject
              if (this.callbacks.logChainEvent) {
                this.callbacks.logChainEvent(`[Host] Lobby full (${this.LOBBY_SIZE}), rejecting ${data.peerId}`);
              }
              conn.close();
            }
          } else {
            // Handle other data types
            this.handleData(conn, data);
          }
        });

        conn.on('close', () => {
          // Remove from tracking when connection closes
          let disconnectedPeerId = null;
          for (const pid in this.basePeerConnections) {
            if (this.basePeerConnections[pid] === conn) {
              disconnectedPeerId = pid;
              delete this.basePeerConnections[pid];
              break;
            }
          }
          
          // Also remove from lobby tracking
          if (disconnectedPeerId) {
            const index = this.lobbyConnectedPeers.indexOf(disconnectedPeerId);
            if (index > -1) {
              this.lobbyConnectedPeers.splice(index, 1);
              if (this.callbacks.logChainEvent) {
                this.callbacks.logChainEvent(`[Host] Player ${disconnectedPeerId} disconnected, removed from lobby. Current players: ${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE}`);
              }
            }
            delete this.lobbyPeerConnections[disconnectedPeerId];
            delete this.partnerConnections[disconnectedPeerId];
            
            // If we lost players, mark lobby as no longer full
            if (this.lobbyConnectedPeers.length < this.LOBBY_SIZE) {
              this.lobbyFull = false;
              if (this.callbacks.logChainEvent) {
                this.callbacks.logChainEvent(`[Host] Lobby no longer full (${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE}), accepting new players`);
              }
              if (this.callbacks.updateConnectionStatus) {
                this.callbacks.updateConnectionStatus(`Waiting for ${this.LOBBY_SIZE} players... (${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE})`);
              }
            }
            
            // Update UI to reflect current state
            if (this.callbacks.updateUI) {
              this.callbacks.updateUI();
            }
          }
        });
      } else {
        // We are not the host - handle general data
        conn.on('data', (data) => this.handleData(conn, data));
      }
      
      conn.on('open', () => {
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Conn] Incoming connection from ${conn.peer}`);
        }
      });
      conn.on('close', () => {
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Conn] Connection closed: ${conn.peer}`, '#ff4444');
        }
      });
      conn.on('error', (err) => {
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Conn] Error: ${err.message}`, '#ff4444');
        }
      });
    });

    this.peer.on('error', (err) => {
      if (this.callbacks.updateConnectionStatus) {
        this.callbacks.updateConnectionStatus(`Peer error: ${err.message}`);
      }
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Peer] Error: ${err.message}`, '#ff4444');
      }
    });
  },

  tryBecomeBase() {
    console.log('[Network] tryBecomeBase() called');
    
    // Clean up any existing basePeer
    if (this.basePeer) {
      this.basePeer.destroy();
      this.basePeer = null;
    }
    
    // Try to claim the BASE_PEER_ID directly
    this.basePeer = new Peer(this.BASE_PEER_ID, {
      host: '0.peerjs.com', port: 443, path: '/', secure: true,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
    });
    this.isDiscoveryBasePeer = true;

    this.basePeer.on('open', (id) => {
      console.log('[Network] Successfully claimed BASE_PEER_ID:', id);
      // Successfully claimed the BASE_PEER_ID - we are the host
      this.isBase = true;
      this.retryCount = 0; // Reset retry count on success
      // Reset and initialize lobby tracking
      this.lobbyConnectedPeers = [this.myPeerId]; // Track all peers including host
      this.lobbyPeerConnections = {}; // Track all peer connections
      this.lobbyFull = false; // Track if lobby is complete
      this.isDiscoveryBasePeer = false; // Now this basePeer is the real host
      
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Base] Became base peer! Initialized lobby with host: ${this.myPeerId}`);
        this.callbacks.logChainEvent(`[Base] Initial lobby state: [${this.lobbyConnectedPeers.join(', ')}] (${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE})`);
      }
      
      if (this.callbacks.updateConnectionStatus) {
        this.callbacks.updateConnectionStatus(`Waiting for ${this.LOBBY_SIZE} players... (1/${this.LOBBY_SIZE})`);
      }
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Base] Waiting for ${this.LOBBY_SIZE} players total.`);
      }
      if (this.callbacks.updateUI) {
        this.callbacks.updateUI();
      }

      this.basePeer.on('connection', (conn) => {
        conn.on('data', (data) => {
          if (data.type === 'join') {
            // Check if lobby is already full BEFORE redirecting
            if (this.lobbyFull || this.lobbyConnectedPeers.length >= this.LOBBY_SIZE) {
              if (this.callbacks.logChainEvent) {
                this.callbacks.logChainEvent(`[Base] Lobby already complete (${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE}), rejecting ${data.peerId}`);
              }
              conn.send({
                type: 'lobby_full',
                message: 'Lobby is full, try again later'
              });
              conn.close();
              return;
            }
            
            // Double-check available space before redirecting
            if (this.lobbyConnectedPeers.length < this.LOBBY_SIZE) {
              // Instead of keeping the base connection, redirect to host's real peer ID
              if (this.callbacks.logChainEvent) {
                this.callbacks.logChainEvent(`[Base] Discovery request from ${data.peerId}, redirecting to host ${this.myPeerId} (${this.lobbyConnectedPeers.length}/${this.LOBBY_SIZE})`);
              }
              
              conn.send({
                type: 'redirect_to_host',
                hostId: this.myPeerId,
                currentPlayers: this.lobbyConnectedPeers.length,
                totalPlayers: this.LOBBY_SIZE
              });
            } else {
              // Lobby just filled up, reject
              if (this.callbacks.logChainEvent) {
                this.callbacks.logChainEvent(`[Base] Lobby just filled up, rejecting ${data.peerId}`);
              }
              conn.send({
                type: 'lobby_full',
                message: 'Lobby is full, try again later'
              });
            }
            
            // Close discovery connection immediately
            conn.close();
          }
        });

        conn.on('close', () => {
          // Discovery connections are temporary - no cleanup needed
          if (this.callbacks.logChainEvent) {
            this.callbacks.logChainEvent(`[Base] Discovery connection closed`);
          }
        });
      });
    });

    this.basePeer.on('error', (err) => {
      console.log('[Network] Failed to claim BASE_PEER_ID, error:', err.type);
      // Failed to claim BASE_PEER_ID - someone else is already the host
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Base] BASE_PEER_ID already taken (${err.type}), checking if lobby is available...`, '#ffaa00');
      }
      this.isBase = false;
      
      // Clean up the failed basePeer
      if (this.basePeer) {
        this.basePeer.destroy();
        this.basePeer = null;
      }
      
      // Try to join existing lobby first
      setTimeout(() => {
        this.joinChain();
      }, 1000);
    });
  },

  joinChain() {
    console.log('[Network] joinChain() called');
    if (this.callbacks.updateConnectionStatus) {
      this.callbacks.updateConnectionStatus('Discovering lobby...');
    }
    
    // First, connect to BASE_PEER_ID for discovery
    this.baseConn = this.peer.connect(this.BASE_PEER_ID);

    this.baseConn.on('open', () => {
      console.log('[Network] Discovery connection opened, sending join request');
      this.baseConn.send({ type: 'join', peerId: this.myPeerId });
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Discovery] Sent discovery request to base`);
      }
    });

    this.baseConn.on('data', (data) => {
      console.log('Client received discovery data:', data);
      
      if (data.type === 'redirect_to_host') {
        // Close discovery connection
        this.baseConn.close();
        
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Discovery] Redirected to host: ${data.hostId}`);
        }
        
        // Connect directly to the host's real peer ID
        this.connectToHost(data.hostId);
        
      } else if (data.type === 'lobby_full') {
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Discovery] Lobby is full, attempting to start new lobby (attempt ${this.retryCount + 1}/${this.maxRetries})...`);
        }
        if (this.callbacks.updateConnectionStatus) {
          this.callbacks.updateConnectionStatus('Lobby full, starting new lobby...');
        }
        
        // Close connection
        this.baseConn.close();
        
        // Increment retry count
        this.retryCount++;
        
        if (this.retryCount < this.maxRetries) {
          // Try to become base with increasing delay
          const delay = 2000 + (this.retryCount * 3000); // 2s, 5s, 8s, 11s, 14s
          setTimeout(() => {
            this.tryBecomeBase();
          }, delay);
        } else {
          // Too many retries, give up for now
          if (this.callbacks.logChainEvent) {
            this.callbacks.logChainEvent(`[Discovery] Too many retry attempts, waiting longer before trying again...`, '#ff4444');
          }
          if (this.callbacks.updateConnectionStatus) {
            this.callbacks.updateConnectionStatus('All lobbies full, waiting...');
          }
          
          // Reset retry count and wait much longer
          this.retryCount = 0;
          setTimeout(() => {
            this.tryBecomeBase();
          }, 30000); // Wait 30 seconds before trying again
        }
      }
    });

    this.baseConn.on('error', (err) => {
      console.log('[Network] Discovery connection error:', err.type);
      if (this.callbacks.updateConnectionStatus) {
        this.callbacks.updateConnectionStatus('Failed to discover lobby');
      }
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Discovery] Error: ${err.message}`, '#ff4444');
      }
      
      // If the discovery connection fails, try to become base after a delay
      setTimeout(() => {
        console.log('[Network] Retrying to become base due to discovery failure');
        this.tryBecomeBase();
      }, 3000);
    });
  },
  
  connectToHost(hostId) {
    if (this.callbacks.updateConnectionStatus) {
      this.callbacks.updateConnectionStatus('Connecting to host...');
    }
    
    // Connect directly to the host's real peer ID
    this.hostConn = this.peer.connect(hostId);

    this.hostConn.on('open', () => {
      this.hostConn.send({ type: 'join_host', peerId: this.myPeerId });
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Client] Connected to host: ${hostId}`);
      }
    });

    this.hostConn.on('data', (data) => {
      console.log('Client received host data:', data);
      
      if (data.type === 'host_ready') {
        // Connected to host - lobby is ready
        this.retryCount = 0; // Reset retry count on successful connection
        this.partnerPeerId = data.hostId; // Host is our connection point
        this.lobbyPeers = data.allPlayers.filter(peer => peer !== this.myPeerId); // All other players
        this.paired = true;
        this.baseConn = this.hostConn; // Use host connection as base connection for compatibility
        
        console.log('Client lobby ready - allPlayers:', data.allPlayers);
        console.log('Client lobby - lobbyPeers (others):', this.lobbyPeers);
        console.log('Client lobby - total players:', data.allPlayers.length);
        
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Client] Connected to host: ${data.hostId}, All players: ${data.allPlayers.join(', ')}`);
          this.callbacks.logChainEvent(`[Client] Lobby has ${data.allPlayers.length} total players (including host)`);
          this.callbacks.logChainEvent(`[Client] Other players: ${this.lobbyPeers.join(', ')}`);
        }
        if (this.callbacks.updateConnectionStatus) {
          this.callbacks.updateConnectionStatus(`Connected to host in ${data.allPlayers.length}-player lobby!`);
        }
        if (this.callbacks.updateUI) {
          this.callbacks.updateUI();
        }
      } else if (data.type === 'waiting') {
        // Host is still waiting for more players
        console.log('Client waiting for more players:', data);
        
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Client] Waiting for more players... (${data.current}/${data.total}) - ${data.message || 'Lobby not full yet'}`);
        }
        if (this.callbacks.updateConnectionStatus) {
          this.callbacks.updateConnectionStatus(`Waiting in queue... (${data.current}/${data.total})`);
        }
        // Update UI to show waiting state
        if (this.callbacks.updateUI) {
          this.callbacks.updateUI();
        }
      } else if (data.type === 'lobby_full') {
        // Host rejected us - lobby is full
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Client] Host lobby is full, becoming host of new lobby...`);
        }
        if (this.callbacks.updateConnectionStatus) {
          this.callbacks.updateConnectionStatus('Lobby full, starting new lobby...');
        }
        
        // Close connection and try to become base
        this.hostConn.close();
        setTimeout(() => {
          this.tryBecomeBase();
        }, 1000);
      } else {
        // Handle all other message types (including 'message' type) through the general handler
        this.handleData(this.hostConn, data);
      }
    });

    this.hostConn.on('error', (err) => {
      if (this.callbacks.updateConnectionStatus) {
        this.callbacks.updateConnectionStatus('Failed to connect to host');
      }
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Client] Host connection error: ${err.message}`, '#ff4444');
      }
    });
  },

  handleData(conn, data) {
    if (this.callbacks.logChainEvent) {
      this.callbacks.logChainEvent(`[HandleData] Received ${data.type} from ${conn.peer}, we are ${this.isBase ? 'HOST' : 'CLIENT'}`);
    }
    
    if (data.type === 'message') {
      // Display the message locally first
      if (this.callbacks.handleMessage) {
        this.callbacks.handleMessage(data);
      }
      
      // Only relay if message is not from us and we haven't already processed it
      if (data.from !== this.myPeerId) {
        this.relayMessage(data, conn ? conn.peer : null);
      }
    }
    
    if (data.type === 'player_state') {
      // Handle incoming player state updates
      if (data.peerId !== this.myPeerId) { // Don't process our own state
        if (this.callbacks.handlePlayerState) {
          this.callbacks.handlePlayerState(data.peerId, data.state);
        }
        
        // Relay to other peers if we're the host
        if (this.isBase) {
          this.relayPlayerState(data, conn ? conn.peer : null);
        }
      }
    }
    
    if (data.type === 'terrain_state') {
      // Handle incoming terrain changes
      if (data.peerId !== this.myPeerId) { // Don't process our own terrain changes
        if (this.callbacks.handleTerrainChanges) {
          this.callbacks.handleTerrainChanges(data.peerId, data.changes);
        }
        
        // Relay to other peers if we're the host
        if (this.isBase) {
          this.relayTerrainChanges(data, conn ? conn.peer : null);
        }
      }
    }
    
    // Note: host_ready is handled in joinChain() baseConn.on('data') callback
    // Don't duplicate that logic here to avoid conflicts
  },

  relayMessage(data, fromPeer) {
    if (this.callbacks.logChainEvent) {
      this.callbacks.logChainEvent(`[Relay] Relaying message from ${data.from}, we are ${this.isBase ? 'HOST' : 'CLIENT'}, fromPeer: ${fromPeer}`);
    }
    
    // If we're the host (center of star), relay to all clients except the sender
    if (this.isBase && this.lobbyPeerConnections) {
      let relayCount = 0;
      for (const [peerId, conn] of Object.entries(this.lobbyPeerConnections)) {
        // Don't send back to the sender, and only send to open connections
        if (peerId !== fromPeer && conn && conn.open) {
          try {
            conn.send(data);
            relayCount++;
            if (this.callbacks.logChainEvent) {
              this.callbacks.logChainEvent(`[Host-Relay] Forwarded message to client: ${peerId}`);
            }
          } catch (err) {
            if (this.callbacks.logChainEvent) {
              this.callbacks.logChainEvent(`[Host-Relay] Failed to send to ${peerId}: ${err.message}`, '#ff4444');
            }
          }
        }
      }
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Host-Relay] Message relayed to ${relayCount} clients`);
      }
    } else if (!this.isBase) {
      // If we're a client, only send to host (clients don't relay to other clients)
      const hostConnection = this.hostConn || this.baseConn;
      if (hostConnection && hostConnection.open && hostConnection.peer !== fromPeer) {
        try {
          hostConnection.send(data);
          if (this.callbacks.logChainEvent) {
            this.callbacks.logChainEvent(`[Client-Relay] Forwarded message to host: ${hostConnection.peer}`);
          }
        } catch (err) {
          if (this.callbacks.logChainEvent) {
            this.callbacks.logChainEvent(`[Client-Relay] Failed to send to host: ${err.message}`, '#ff4444');
          }
        }
      }
    }
  },

  relayPlayerState(data, fromPeer) {
    // Only the host relays player states to prevent loops
    if (this.isBase && this.lobbyPeerConnections) {
      let relayCount = 0;
      for (const [peerId, conn] of Object.entries(this.lobbyPeerConnections)) {
        // Don't send back to the sender, and only send to open connections
        if (peerId !== fromPeer && conn && conn.open) {
          try {
            conn.send(data);
            relayCount++;
          } catch (err) {
            console.warn(`[Host-PlayerStateRelay] Failed to send to ${peerId}:`, err);
          }
        }
      }
    }
  },

  sendMessage(text) {
    if (!this.isInitialized) {
      if (this.callbacks.updateConnectionStatus) {
        this.callbacks.updateConnectionStatus('Error: Peer not initialized.');
      }
      return null;
    }

    if (!text || text.trim() === '') {
      if (this.callbacks.updateConnectionStatus) {
        this.callbacks.updateConnectionStatus('Error: Message cannot be empty.');
      }
      return null;
    }

    const message = {
      id: `${this.myPeerId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      peerId: this.myPeerId,
      text: text.trim(),
      timestamp: Date.now(),
    };

    const payload = {
      type: 'message',
      messages: [message],
      from: this.myPeerId
    };

    let sentCount = 0;
    let failedCount = 0;

    // If we're the host (center of star), send to all clients
    if (this.isBase && this.lobbyPeerConnections) {
      for (const [peerId, conn] of Object.entries(this.lobbyPeerConnections)) {
        if (conn && conn.open) {
          try {
            conn.send(payload);
            sentCount++;
            if (this.callbacks.logChainEvent) {
              this.callbacks.logChainEvent(`[Host-Send] Message sent to client: ${peerId}`);
            }
          } catch (err) {
            failedCount++;
            if (this.callbacks.logChainEvent) {
              this.callbacks.logChainEvent(`[Host-Send] Failed to send to ${peerId}: ${err.message}`, '#ff4444');
            }
          }
        } else {
          failedCount++;
          if (this.callbacks.logChainEvent) {
            this.callbacks.logChainEvent(`[Host-Send] Connection to ${peerId} is not open`, '#ff4444');
          }
        }
      }
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Host-Send] Message sent to ${sentCount} clients total (${failedCount} failed)`);
      }
    } else if (!this.isBase) {
      // If we're a client, send only to host (host will relay to other clients)
      const hostConnection = this.hostConn || this.baseConn;
      if (hostConnection && hostConnection.open) {
        try {
          hostConnection.send(payload);
          sentCount = 1;
          if (this.callbacks.logChainEvent) {
            this.callbacks.logChainEvent(`[Client-Send] Message sent to host: ${hostConnection.peer}`);
          }
        } catch (err) {
          if (this.callbacks.logChainEvent) {
            this.callbacks.logChainEvent(`[Client-Send] Failed to send to host: ${err.message}`, '#ff4444');
          }
        }
      } else {
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Client-Send] No open host connection available`, '#ff4444');
        }
      }
    }

    if (sentCount > 0) {
      if (this.callbacks.updateConnectionStatus) {
        this.callbacks.updateConnectionStatus(`Message sent to ${sentCount} peer(s).`);
      }
      return message;
    } else {
      if (this.callbacks.updateConnectionStatus) {
        this.callbacks.updateConnectionStatus('Error: No active connections.');
      }
      return null;
    }
  },

  // Reset lobby state and rejoin matchmaking
  resetPairingAndRejoin() {
    // Reset lobby state
    this.paired = false;
    this.partnerPeerId = null;
    this.lobbyPeers = [];
    this.lobbyConnectedPeers = [];
    this.lobbyPeerConnections = {};
    this.lobbyFull = false;
    
    // Clean up host connections if we were the host
    if (this.isBase && this.partnerConnections) {
      for (const [peerId, conn] of Object.entries(this.partnerConnections)) {
        if (conn) {
          conn.close();
        }
      }
      this.partnerConnections = {};
    }
    
    // Clean up BASE_PEER_ID if we were the host
    if (this.isBase && this.basePeer) {
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Reset] Releasing BASE_PEER_ID during reset`);
      }
      this.basePeer.destroy();
      this.basePeer = null;
    }
    
    // Clean up client connections if we were a client
    if (this.baseConn) {
      this.baseConn.close();
      this.baseConn = null;
    }
    if (this.hostConn) {
      this.hostConn.close();
      this.hostConn = null;
    }
    
    // Reset host status
    this.isBase = false;
    
    // Update UI to show we're looking for a new lobby
    if (this.callbacks.updateConnectionStatus) {
      this.callbacks.updateConnectionStatus('Lobby disconnected, looking for new lobby...');
    }
    if (this.callbacks.updateUI) {
      this.callbacks.updateUI();
    }
    
    // Start looking for a new lobby
    if (this.callbacks.logChainEvent) {
      this.callbacks.logChainEvent(`[Rejoin] Starting search for new ${this.LOBBY_SIZE}-player lobby...`, '#ffaa00');
    }
    
    // Try to become host first, if that fails, join existing host
    setTimeout(() => {
      this.tryBecomeBase();
    }, 1000);
  },

  // Auto-reconnection - updated for host-based system
  startAutoReconnect() {
    setInterval(() => {
      if (!this.isInitialized) return;
      
      // If we're a client and lost connection to host
      if (!this.isBase && this.partnerPeerId && (!this.baseConn || this.baseConn.open === false)) {
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Auto] Attempting to reconnect to host: ${this.partnerPeerId}`, '#00ccff');
        }
        this.resetPairingAndRejoin();
      }
      
      // If we're a host and lost clients, they will try to reconnect to us
      if (this.isBase && this.paired && this.partnerConnections) {
        const activeConnections = Object.values(this.partnerConnections).filter(conn => conn && conn.open).length;
        const totalConnections = Object.keys(this.partnerConnections).length;
        
        if (activeConnections < totalConnections) {
          if (this.callbacks.logChainEvent) {
            this.callbacks.logChainEvent(`[Auto] Host has ${activeConnections}/${totalConnections} active client connections`, '#ff8800');
          }
        }
      }
      
      // If we're not in a lobby at all, try to find one
      if (!this.paired && !this.isBase) {
        if (this.callbacks.logChainEvent) {
          this.callbacks.logChainEvent(`[Auto] Not in lobby, attempting to find ${this.LOBBY_SIZE}-player lobby...`, '#00ccff');
        }
        this.tryBecomeBase();
      }
    }, 5000);
  },

  // --- PLAYER STATE SYNCHRONIZATION ---
  
  // Send player state to all connected peers
  broadcastPlayerState(playerState) {
    if (!this.paired && !this.isBase) return;
    
    const stateMessage = {
      type: 'player_state',
      peerId: this.myPeerId,
      state: playerState,
      timestamp: Date.now()
    };
    
    // If we're the host, send to all connected clients
    if (this.isBase && this.lobbyPeerConnections) {
      for (const [peerId, conn] of Object.entries(this.lobbyPeerConnections)) {
        if (conn && conn.open) {
          try {
            conn.send(stateMessage);
          } catch (error) {
            console.warn(`[Network] Failed to send player state to ${peerId}:`, error);
          }
        }
      }
    }
    
    // If we're a client, send to host (host will relay to other clients)
    if (!this.isBase) {
      const hostConnection = this.hostConn || this.baseConn;
      if (hostConnection && hostConnection.open) {
        try {
          hostConnection.send(stateMessage);
        } catch (error) {
          console.warn(`[Network] Failed to send player state to host:`, error);
        }
      }
    }
  },
  
  // Get current lobby peer IDs (excluding self)
  getLobbyPeerIds() {
    const allPeers = [];
    
    if (this.isBase && this.lobbyConnectedPeers) {
      // For host, return all connected clients (excluding self)
      allPeers.push(...this.lobbyConnectedPeers.filter(peerId => peerId !== this.myPeerId));
    } else if (this.paired && this.lobbyPeers) {
      // For client, return all other players from lobby
      allPeers.push(...this.lobbyPeers.filter(peerId => peerId !== this.myPeerId));
    }
    
    return allPeers;
  },
  
  // Check if we're in a complete lobby
  isInCompleteLobby() {
    return this.paired || (this.isBase && this.lobbyFull);
  },

  // --- TERRAIN SYNCHRONIZATION ---
  
  // Send terrain changes to all connected peers
  broadcastTerrainChanges(terrainChanges) {
    if (!this.paired && !this.isBase) return;
    
    const terrainMessage = {
      type: 'terrain_state',
      peerId: this.myPeerId,
      changes: terrainChanges,
      timestamp: Date.now()
    };
    
    // If we're the host, send to all connected clients
    if (this.isBase && this.lobbyPeerConnections) {
      for (const [peerId, conn] of Object.entries(this.lobbyPeerConnections)) {
        if (conn && conn.open) {
          try {
            conn.send(terrainMessage);
          } catch (error) {
            console.warn(`[Network] Failed to send terrain changes to ${peerId}:`, error);
          }
        }
      }
    }
    
    // If we're a client, send to host (host will relay to other clients)
    if (!this.isBase) {
      const hostConnection = this.hostConn || this.baseConn;
      if (hostConnection && hostConnection.open) {
        try {
          hostConnection.send(terrainMessage);
        } catch (error) {
          console.warn(`[Network] Failed to send terrain changes to host:`, error);
        }
      }
    }
  },

  // Relay terrain state to other peers (host only)
  relayTerrainChanges(data, fromPeer) {
    if (this.callbacks.logChainEvent) {
      this.callbacks.logChainEvent(`[Relay] Relaying terrain changes from ${data.peerId}, fromPeer: ${fromPeer}`);
    }
    
    // If we're the host (center of star), relay to all clients except the sender
    if (this.isBase && this.lobbyPeerConnections) {
      let relayCount = 0;
      for (const [peerId, conn] of Object.entries(this.lobbyPeerConnections)) {
        // Don't send back to the sender, and only send to open connections
        if (peerId !== fromPeer && conn && conn.open) {
          try {
            conn.send(data);
            relayCount++;
          } catch (error) {
            console.warn(`[Network] Failed to relay terrain changes to ${peerId}:`, error);
          }
        }
      }
      if (this.callbacks.logChainEvent) {
        this.callbacks.logChainEvent(`[Relay] Relayed terrain changes to ${relayCount} peers`);
      }
    }
  }
};

// Export the Network object for use in other files
window.Network = Network;