import { useState, useRef, useCallback, useEffect } from 'react';

export function useWebRTC(endpointUrl: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      // 1. Get local microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      // 2. Setup RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      peerConnectionRef.current = pc;

      // Add local tracks to peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // 3. Setup Data Channel for Gaussian offsets (Phase 1)
      const dataChannel = pc.createDataChannel('gaussian_offsets');
      dataChannelRef.current = dataChannel;
      
      dataChannel.onmessage = (event) => {
        // Here we would receive the Float32Array from the Python backend
        // and dispatch it to the 3D viewer
        // console.log("Received offsets of length", event.data.byteLength);
      };

      // 4. Handle incoming audio (from AI)
      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        const audioElement = new Audio();
        audioElement.srcObject = remoteStream;
        audioElement.play().catch(e => console.error("Error playing AI audio:", e));
      };

      // 5. Offer/Answer SDP exchange (mocked for fastrtc endpoint)
      // FastRTC creates an offer via POST to /rtc
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      try {
        const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sdp: pc.localDescription?.sdp,
            type: pc.localDescription?.type,
          }),
        });
        
        if (response.ok) {
          const answer = await response.json();
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          setIsConnected(true);
        } else {
          throw new Error('Failed to connect to signaling server');
        }
      } catch (err) {
        console.warn("Could not connect to backend, running in offline mode.", err);
        // We do not set isConnected to true, but we don't crash.
        setError("Backend unreachable. Ensure server.py is running on port 8000.");
      }

    } catch (err: any) {
      console.error('Error starting WebRTC:', err);
      setError(err.message || 'Failed to start WebRTC');
    } finally {
      setIsConnecting(false);
    }
  }, [endpointUrl]);

  const disconnect = useCallback(() => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsConnected(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    connect,
    disconnect
  };
}
