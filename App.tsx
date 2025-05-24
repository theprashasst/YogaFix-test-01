
import React, { useState, useEffect, useCallback } from 'react';
import VideoFeed from './components/VideoFeed';
import PoseImage from './components/PoseImage';
import FeedbackDisplay from './components/FeedbackDisplay';
import useExerciseLogic from './hooks/useExerciseLogic';
import useTTS from './hooks/useTTS';
import { ExerciseConfig, ExercisePhase, PoseLandmarks } from './types';
import { CONFIG_FILE_PATH } from './constants';
import { wrapText } from './services/poseUtils';

const App: React.FC = () => {
  const [config, setConfig] = useState<ExerciseConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [availableVideoDevices, setAvailableVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState<string | undefined>(undefined);

  const { speak, stop: stopTTS } = useTTS();

  const handleCameraError = useCallback(() => {
     setAppPhase(ExercisePhase.CAMERA_ERROR);
  }, []);

  const handlePoseInitError = useCallback(() => {
    setAppPhase(ExercisePhase.POSE_INIT_ERROR);
  }, []);

  const {
    phase: logicPhase, // Renamed to avoid conflict with appPhase
    currentPoseData,
    currentPoseDisplayName,
    angleDetails,
    feedbackMessages,
    holdProgress,
    startNextPose,
    processFrameLandmarks,
    resetWorkout,
    setPhaseManually: setLogicPhase, // Get the function to set logic phase
  } = useExerciseLogic({ 
    config, 
    speak, 
    stopTTS, 
    onCameraError: handleCameraError, // Pass this down
    onPoseInitError: handlePoseInitError // Pass this down
  });

  const [appPhase, setAppPhase] = useState<ExercisePhase>(ExercisePhase.LOADING_CONFIG);

  // Sync appPhase with logicPhase, but allow appPhase to override for global states
  useEffect(() => {
    if (appPhase !== ExercisePhase.CAMERA_ERROR && 
        appPhase !== ExercisePhase.POSE_INIT_ERROR &&
        appPhase !== ExercisePhase.LOADING_CONFIG &&
        appPhase !== ExercisePhase.CONFIG_ERROR &&
        appPhase !== ExercisePhase.INITIALIZING_POSE 
        ) {
      setAppPhase(logicPhase);
    }
  }, [logicPhase, appPhase]);

  // Effect to set initial phase in exerciseLogic once config is loaded
   useEffect(() => {
    if (config && appPhase === ExercisePhase.LOADING_CONFIG) {
      setAppPhase(ExercisePhase.INITIALIZING_POSE); // New state before IDLE
      setLogicPhase(ExercisePhase.INITIALIZING_POSE);
    }
  }, [config, appPhase, setLogicPhase]);


  const handlePoseInitReady = useCallback(() => {
    console.log("App: Pose Landmarker Ready. Setting phase to IDLE.");
    setAppPhase(ExercisePhase.IDLE);
    setLogicPhase(ExercisePhase.IDLE); // Also update logic hook's phase
  }, [setLogicPhase]);


  useEffect(() => {
    const fetchConfig = async () => {
      setAppPhase(ExercisePhase.LOADING_CONFIG);
      setConfigError(null);
      try {
        const response = await fetch(CONFIG_FILE_PATH);
        if (!response.ok) {
          throw new Error(`Failed to load config: ${response.statusText}`);
        }
        const data: ExerciseConfig = await response.json();
        setConfig(data);
        // Phase transition to INITIALIZING_POSE will happen in the effect above once config is set.
      } catch (error) {
        console.error(error);
        setConfigError((error as Error).message);
        setAppPhase(ExercisePhase.CONFIG_ERROR);
      }
    };
    fetchConfig();
  }, []); 

  useEffect(() => {
    const getVideoDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({video: true}); // Request permission first
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setAvailableVideoDevices(videoDevices);
        if (videoDevices.length > 0 && !selectedVideoDeviceId) {
          setSelectedVideoDeviceId(videoDevices[0].deviceId);
        }
      } catch (error) {
        console.error("Error enumerating video devices or getting permission:", error);
        // If permission denied, it often manifests as a camera error here.
        // The VideoFeed component will also try to get user media and report error.
        if ((error as Error).name === "NotAllowedError" || (error as Error).name === "NotFoundError") {
            handleCameraError();
        }
      }
    };
    if (appPhase !== ExercisePhase.LOADING_CONFIG && appPhase !== ExercisePhase.CONFIG_ERROR) {
        getVideoDevices();
    }
  }, [appPhase, selectedVideoDeviceId, handleCameraError]);


  const handleLandmarks = (landmarks: PoseLandmarks, frameWidth: number, frameHeight: number) => {
    // Only process if the app (and logic) is in correction phase and pose is initialized
    if (appPhase === ExercisePhase.CORRECTION && logicPhase === ExercisePhase.CORRECTION) {
      processFrameLandmarks(landmarks, frameWidth, frameHeight);
    }
  };
  
  const handleStartWorkout = () => {
    if (appPhase === ExercisePhase.IDLE && logicPhase === ExercisePhase.IDLE) {
      startNextPose();
    } else {
      console.warn("Cannot start workout, app not in IDLE state or MediaPipe not ready.", appPhase, logicPhase);
    }
  };
  
  const handleResetWorkout = () => {
    resetWorkout();
    // After reset, if config is fine, it should go back to IDLE (or INITIALIZING_POSE if that's the flow)
    if (config) {
        setAppPhase(ExercisePhase.IDLE); // Or INITIALIZING_POSE if video needs re-init
        setLogicPhase(ExercisePhase.IDLE); // Reset logic phase too
    } else {
        setAppPhase(ExercisePhase.LOADING_CONFIG); // Should not happen if reset is available
    }
  }


  const renderContent = () => {
    switch (appPhase) {
      case ExercisePhase.LOADING_CONFIG:
        return <p className="text-2xl text-center p-8">Loading exercise configuration...</p>;
      case ExercisePhase.CONFIG_ERROR:
        return <p className="text-2xl text-red-500 text-center p-8">Error loading configuration: {configError}. Please check console and public/exercise_config.json.</p>;
      case ExercisePhase.INITIALIZING_POSE:
        return <p className="text-2xl text-center p-8">Initializing AI Engine...</p>;
      case ExercisePhase.POSE_INIT_ERROR:
        return (
            <div className="text-center p-8">
                <p className="text-2xl text-red-500">AI Engine Error</p>
                <p className="mt-2 text-lg">Could not initialize the AI pose detection engine. This might be due to model loading issues or browser incompatibility.</p>
                <p className="mt-1 text-sm">Please ensure you have a stable internet connection, try refreshing the page, or check the browser console for details.</p>
                 <p className="mt-1 text-xs">Make sure `public/models/pose_landmarker_lite.task` exists.</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-6 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
                >
                    Refresh Page
                </button>
            </div>
        );
      case ExercisePhase.CAMERA_ERROR:
        return (
            <div className="text-center p-8">
                <p className="text-2xl text-red-500">Camera Error</p>
                <p className="mt-2 text-lg">Could not access the camera. Please ensure permission is granted and no other application is using it.</p>
                <p className="mt-1 text-sm">You might need to refresh the page or check browser settings.</p>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-6 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
                >
                    Refresh Page
                </button>
            </div>
        );
      case ExercisePhase.IDLE:
        return (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <h1 className="text-5xl font-bold mb-8 text-teal-300">AI Exercise Coach</h1>
            <p className="text-xl mb-8 text-center max-w-2xl">Welcome! Get ready to improve your form with AI-powered guidance. Press Start when you're ready.</p>
            {availableVideoDevices.length > 1 && (
                <div className="mb-6">
                    <label htmlFor="videoDeviceSelect" className="block text-lg font-medium text-gray-300 mb-2">Select Camera:</label>
                    <select
                        id="videoDeviceSelect"
                        value={selectedVideoDeviceId}
                        onChange={(e) => setSelectedVideoDeviceId(e.target.value)}
                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5"
                    >
                        {availableVideoDevices.map(device => (
                            <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${availableVideoDevices.indexOf(device) + 1}`}</option>
                        ))}
                    </select>
                </div>
            )}
            <button
              onClick={handleStartWorkout}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg text-2xl transition-transform duration-150 ease-in-out hover:scale-105 shadow-lg"
            >
              Start Workout
            </button>
          </div>
        );
      case ExercisePhase.DESCRIPTION:
        return (
          <div className="flex flex-col items-center justify-center h-full p-8 bg-black bg-opacity-60">
            <h2 className="text-4xl font-bold mb-4 text-teal-300">Get Ready: {currentPoseDisplayName}</h2>
            {currentPoseData?.description && wrapText(currentPoseData.description, 60).map((line, idx) => (
              <p key={idx} className="text-xl text-gray-200 mb-2 text-center max-w-3xl">{line}</p>
            ))}
          </div>
        );
      case ExercisePhase.IMAGE:
        return currentPoseData && (
          <div className="flex items-center justify-center h-full">
            <PoseImage imagePath={currentPoseData.image_path} poseName={currentPoseDisplayName} />
          </div>
        );
      case ExercisePhase.CORRECTION:
        return ( <></> ); // VideoFeed takes full space, FeedbackDisplay overlays it
      case ExercisePhase.COMPLETED:
        return (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <h1 className="text-5xl font-bold mb-8 text-green-400">Workout Complete!</h1>
            <p className="text-2xl mb-8 text-center">Great job! You've finished the session.</p>
            <button
              onClick={handleResetWorkout}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-8 rounded-lg text-2xl transition-transform duration-150 ease-in-out hover:scale-105 shadow-lg"
            >
              Start Over
            </button>
          </div>
        );
      default:
        return <p>Unknown application phase: {appPhase}.</p>;
    }
  };

  const showVideoFeed = 
    appPhase === ExercisePhase.IDLE || // Show for camera selection
    appPhase === ExercisePhase.INITIALIZING_POSE || // Ensure VideoFeed is active for AI engine init
    appPhase === ExercisePhase.DESCRIPTION || 
    appPhase === ExercisePhase.IMAGE || 
    appPhase === ExercisePhase.CORRECTION;

  return (
    <div className="h-screen w-screen flex flex-col relative overflow-hidden bg-gray-800">
      {showVideoFeed && config && (
        <div 
            className={`absolute inset-0 transition-opacity duration-500 ${appPhase === ExercisePhase.CORRECTION || appPhase === ExercisePhase.IDLE ? 'opacity-100' : 'opacity-30'}`}
            style={{ visibility: (appPhase === ExercisePhase.IDLE && !selectedVideoDeviceId) ? 'hidden' : 'visible' }} // Hide if IDLE and no camera selected for preview
        >
          <VideoFeed
            onLandmarks={handleLandmarks}
            angleDetailsToDraw={angleDetails}
            onCameraError={handleCameraError}
            onPoseInitReady={handlePoseInitReady}
            onPoseInitError={handlePoseInitError}
            debugMode={showDebug}
            videoDeviceId={selectedVideoDeviceId}
          />
        </div>
      )}
      
      <div className="relative z-10 flex-grow flex items-center justify-center">
        {renderContent()}
      </div>

      {appPhase === ExercisePhase.CORRECTION && (
        <FeedbackDisplay
          messages={feedbackMessages}
          holdProgress={holdProgress}
          currentPoseName={currentPoseDisplayName}
        />
      )}

      <div className="absolute top-4 right-4 z-20 flex space-x-2">
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="bg-gray-700 hover:bg-gray-600 text-white text-xs py-1 px-2 rounded"
        >
          Debug Lines {showDebug ? 'ON' : 'OFF'}
        </button>
         { (appPhase !== ExercisePhase.IDLE && 
            appPhase !== ExercisePhase.LOADING_CONFIG && 
            appPhase !== ExercisePhase.CONFIG_ERROR && 
            appPhase !== ExercisePhase.CAMERA_ERROR &&
            appPhase !== ExercisePhase.INITIALIZING_POSE &&
            appPhase !== ExercisePhase.POSE_INIT_ERROR
            ) &&
         <button
            onClick={handleResetWorkout}
            className="bg-red-500 hover:bg-red-700 text-white text-xs py-1 px-2 rounded"
          >
            Reset Workout
          </button>
        }
      </div>
    </div>
  );
};

export default App;
