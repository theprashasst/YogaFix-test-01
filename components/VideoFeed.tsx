import React, { useEffect, useRef, useCallback, useState } from 'react';
import { AngleDetail, PoseLandmarks, NormalizedLandmarkList } from '../types'; // PoseLandmarks is NormalizedLandmarkList | null
import { DEFAULT_CAMERA_WIDTH, DEFAULT_CAMERA_HEIGHT, COLOR_LANDMARK } from '../constants';

// Define a more specific type for PoseLandmarkerResult if needed, or use 'any'
// For now, structure from documentation: { landmarks: NormalizedLandmarkList[] }
interface PoseLandmarkerResult {
  landmarks: NormalizedLandmarkList[]; // Array of poses, each pose is a NormalizedLandmarkList
  worldLandmarks?: any; // Optional
  segmentationMasks?: any; // Optional
}

// Extend Window interface to include mpVision and its components
declare global {
  interface Window {
    mpVision?: { // Optional to handle loading states
      PoseLandmarker: {
        createFromOptions: (filesetResolver: any, options: any) => Promise<any>; // Returns a PoseLandmarker instance
        POSE_CONNECTIONS: Array<[number, number]>;
        PoseLandmark: { [key: string]: number }; // For landmark name to index mapping
      };
      FilesetResolver: {
        forVisionTasks: (path: string) => Promise<any>;
      };
      DrawingUtils: new (context: CanvasRenderingContext2D) => {
        drawLandmarks: (landmarks: NormalizedLandmarkList, options?: any) => void;
        drawConnectors: (landmarks: NormalizedLandmarkList, connections: Array<[number, number]>, options?: any) => void;
      };
    };
  }
}

interface VideoFeedProps {
  onLandmarks: (landmarks: PoseLandmarks, frameWidth: number, frameHeight: number) => void;
  angleDetailsToDraw: AngleDetail[];
  onCameraError: () => void;
  onPoseInitReady: () => void; // Callback when pose landmarker is ready
  onPoseInitError: () => void; // Callback if pose landmarker fails to initialize
  debugMode?: boolean;
  videoDeviceId?: string;
}

const VideoFeed: React.FC<VideoFeedProps> = ({ 
  onLandmarks, 
  angleDetailsToDraw, 
  onCameraError,
  onPoseInitReady,
  onPoseInitError,
  debugMode = false,
  videoDeviceId
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseLandmarkerRef = useRef<any | null>(null); // Stores the PoseLandmarker instance
  const animationFrameIdRef = useRef<number | null>(null);
  const [isCameraSetup, setIsCameraSetup] = useState(false);

  const setupCamera = useCallback(async () => {
    if (!videoRef.current) return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: DEFAULT_CAMERA_WIDTH,
          height: DEFAULT_CAMERA_HEIGHT,
          deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined,
        },
      });
      videoRef.current.srcObject = stream;
      return new Promise<HTMLVideoElement>((resolve) => {
        videoRef.current!.onloadedmetadata = () => {
          setIsCameraSetup(true);
          resolve(videoRef.current!);
        }
      });
    } catch (error) {
      console.error("Error accessing camera:", error);
      onCameraError();
      setIsCameraSetup(false);
      return null;
    }
  }, [onCameraError, videoDeviceId]);

  const handlePoseLandmarkerResults = useCallback((results: PoseLandmarkerResult): void => {
    if (!canvasRef.current || !videoRef.current || !window.mpVision) return;

    const canvasCtx = canvasRef.current.getContext('2d');
    if (!canvasCtx) return;

    const videoElement = videoRef.current;
    canvasRef.current.width = videoElement.videoWidth;
    canvasRef.current.height = videoElement.videoHeight;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    canvasCtx.translate(canvasRef.current.width, 0);
    canvasCtx.scale(-1, 1);
    canvasCtx.drawImage(videoElement, 0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // Pass the landmarks of the first detected pose, or null if no poses.
    const firstPoseLandmarks: PoseLandmarks = results.landmarks && results.landmarks.length > 0 ? results.landmarks[0] : null;
    onLandmarks(firstPoseLandmarks, canvasRef.current.width, canvasRef.current.height);

    if (firstPoseLandmarks && window.mpVision?.DrawingUtils && window.mpVision?.PoseLandmarker?.POSE_CONNECTIONS) {
      const drawingUtils = new window.mpVision.DrawingUtils(canvasCtx);
      if (debugMode) {
        // Draw all landmarks and connections for the first detected pose
         for (const landmarkSet of results.landmarks) { // Iterate if multiple poses detected by model (though we set numPoses=1)
            drawingUtils.drawLandmarks(landmarkSet, { color: COLOR_LANDMARK, lineWidth: 1, radius: 3 });
            drawingUtils.drawConnectors(landmarkSet, window.mpVision.PoseLandmarker.POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        }
      } else {
         // Draw specific angle lines based on angleDetailsToDraw (derived from the first pose)
         angleDetailsToDraw.forEach(detail => {
          if (detail.angle > -1) { 
            canvasCtx.beginPath();
            canvasCtx.moveTo(detail.p1.x, detail.p1.y);
            canvasCtx.lineTo(detail.p2.x, detail.p2.y);
            canvasCtx.lineTo(detail.p3.x, detail.p3.y);
            canvasCtx.strokeStyle = detail.color;
            canvasCtx.lineWidth = 3;
            canvasCtx.stroke();
            
            canvasCtx.beginPath();
            canvasCtx.arc(detail.p2.x, detail.p2.y, 6, 0, 2 * Math.PI);
            canvasCtx.fillStyle = detail.color;
            canvasCtx.fill();
          }
        });
      }
    }
    canvasCtx.restore();
  }, [onLandmarks, angleDetailsToDraw, debugMode]);


  useEffect(() => {
    let isMounted = true;
    const initializeAndStart = async () => {
      if (!isMounted || !window.mpVision || poseLandmarkerRef.current) return;

      try {
        const vision = await window.mpVision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        
        // **IMPORTANT**: User must place pose_landmarker_lite.task (or other model) 
        // in the public/models/ directory.
        poseLandmarkerRef.current = await window.mpVision.PoseLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath: `/models/pose_landmarker_lite.task`,
              delegate: "GPU" // or "CPU"
            },
            runningMode: "VIDEO",
            numPoses: 1, // Max poses to detect
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false
          }
        );
        if (!isMounted) return;
        console.log("Pose Landmarker initialized.");
        onPoseInitReady(); // Signal that pose landmarker is ready

        // Now setup camera if pose landmarker is ready
        const videoElement = await setupCamera();
        if (videoElement && poseLandmarkerRef.current && isMounted) {
            requestVideoFrame(videoElement);
        } else if (!videoElement && isMounted) {
            onCameraError(); // Camera setup failed after pose init
        }

      } catch (error) {
        console.error("Failed to initialize Pose Landmarker:", error);
        if (isMounted) onPoseInitError();
      }
    };
    
    // Wait for mpVision to be available (CDN load)
    const checkMpVisionInterval = setInterval(() => {
        if (window.mpVision) {
            clearInterval(checkMpVisionInterval);
            initializeAndStart();
        }
    }, 100);
    setTimeout(() => { // Timeout for waiting for mpVision
        clearInterval(checkMpVisionInterval);
        if(!window.mpVision && isMounted) {
            console.error("MediaPipe tasks-vision (mpVision) not loaded from CDN after timeout.");
            onPoseInitError();
        }
    }, 5000);


    const requestVideoFrame = (videoElement: HTMLVideoElement) => {
        const processVideo = async () => {
            if (!isMounted || !poseLandmarkerRef.current || videoElement.paused || videoElement.ended) {
                if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
                return;
            }
            if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                const nowInMs = performance.now(); // Use performance.now for more accurate timing
                try {
                    const results = poseLandmarkerRef.current.detectForVideo(videoElement, nowInMs);
                    if (results) {
                        handlePoseLandmarkerResults(results);
                    }
                } catch (e) {
                    console.error("Error during detectForVideo:", e);
                     // Potentially stop or signal error
                }
            }
            animationFrameIdRef.current = requestAnimationFrame(processVideo);
        };
        animationFrameIdRef.current = requestAnimationFrame(processVideo);
    };

    return () => {
      isMounted = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close().catch((err: any) => console.error("Error closing pose landmarker:", err));
        poseLandmarkerRef.current = null;
      }
      setIsCameraSetup(false);
      clearInterval(checkMpVisionInterval); // Clear interval on unmount
    };
  }, [setupCamera, handlePoseLandmarkerResults, onPoseInitReady, onPoseInitError, onCameraError]); 

  return (
    <div className="relative w-full h-full video-feed-container">
      <video ref={videoRef} className="hidden" autoPlay playsInline muted width={DEFAULT_CAMERA_WIDTH} height={DEFAULT_CAMERA_HEIGHT}></video>
      <canvas ref={canvasRef} className="w-full h-full"></canvas>
      {!isCameraSetup && <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white"><p>Initializing camera...</p></div>}
    </div>
  );
};

export default VideoFeed;