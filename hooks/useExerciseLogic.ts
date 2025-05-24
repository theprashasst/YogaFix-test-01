import { useState, useEffect, useCallback, useRef } from 'react';
import { ExerciseConfig, PoseData, ExercisePhase, AngleDetail, PoseLandmarks, NormalizedLandmarkList } from '../types';
import { checkPoseAngles } from '../services/poseUtils';
import { DESCRIPTION_DISPLAY_TIME, IMAGE_DISPLAY_TIME, POSE_HOLD_SECONDS, EASY_MODE_TOLERANCE } from '../constants';

interface UseExerciseLogicProps {
  config: ExerciseConfig | null;
  speak: (text: string) => void;
  stopTTS: () => void;
  onCameraError: () => void;
  onPoseInitError: () => void; // Callback for pose initialization errors
}

interface ExerciseLogicState {
  phase: ExercisePhase;
  currentPoseData: PoseData | null;
  currentPoseDisplayName: string;
  angleDetails: AngleDetail[];
  feedbackMessages: string[];
  holdProgress: number; // 0 to 1
  startNextPose: () => void;
  processFrameLandmarks: (landmarks: PoseLandmarks, frameWidth: number, frameHeight: number) => void; // PoseLandmarks is NormalizedLandmarkList | null
  resetWorkout: () => void;
  setPhaseManually: (phase: ExercisePhase) => void; // To allow App.tsx to set phase for init
}

const useExerciseLogic = ({ config, speak, stopTTS, onCameraError, onPoseInitError }: UseExerciseLogicProps): ExerciseLogicState => {
  const [phase, setPhase] = useState<ExercisePhase>(ExercisePhase.IDLE);
  const [currentPoseIndex, setCurrentPoseIndex] = useState<number>(-1);
  const [currentPoseData, setCurrentPoseData] = useState<PoseData | null>(null);
  const [currentPoseDisplayName, setCurrentPoseDisplayName] = useState<string>("");
  
  const [angleDetails, setAngleDetails] = useState<AngleDetail[]>([]);
  const [feedbackMessages, setFeedbackMessages] = useState<string[]>([]);
  
  const [holdStartTime, setHoldStartTime] = useState<number | null>(null);
  const [holdProgress, setHoldProgress] = useState<number>(0);

  const phaseTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (config && phase !== ExercisePhase.INITIALIZING_POSE && phase !== ExercisePhase.POSE_INIT_ERROR) { // Ensure config is loaded before trying to start
      setPhase(ExercisePhase.IDLE);
      setCurrentPoseIndex(-1);
    } else if (!config && phase !== ExercisePhase.CONFIG_ERROR) {
      setPhase(ExercisePhase.LOADING_CONFIG);
    }
  }, [config, phase]);
  
  const clearPhaseTimeout = () => {
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }
  };

  const setPhaseManually = useCallback((newPhase: ExercisePhase) => {
    clearPhaseTimeout();
    // Potentially stop TTS or other actions depending on the new phase
    if (newPhase === ExercisePhase.POSE_INIT_ERROR || newPhase === ExercisePhase.CAMERA_ERROR) {
      stopTTS();
    }
    setPhase(newPhase);
  }, [stopTTS]);


  const startNextPose = useCallback(() => {
    clearPhaseTimeout();
    stopTTS();
    setAngleDetails([]);
    setFeedbackMessages([]);
    setHoldStartTime(null);
    setHoldProgress(0);

    if (!config) {
      setPhase(ExercisePhase.CONFIG_ERROR); 
      return;
    }
    // Ensure pose landmarker is ready before starting sequence
    if (phase === ExercisePhase.INITIALIZING_POSE || phase === ExercisePhase.POSE_INIT_ERROR) {
        console.warn("Pose Landmarker not ready, cannot start next pose.");
        if(phase === ExercisePhase.POSE_INIT_ERROR) onPoseInitError();
        return;
    }


    const nextIndex = currentPoseIndex + 1;
    if (nextIndex >= config.sequence.length) {
      setPhase(ExercisePhase.COMPLETED);
      speak("Workout completed! Well done.");
      setCurrentPoseData(null);
      setCurrentPoseDisplayName("Workout Complete!");
      return;
    }

    setCurrentPoseIndex(nextIndex);
    const poseName = config.sequence[nextIndex];
    const pose = config.poses[poseName];
    setCurrentPoseData(pose);
    const displayName = pose?.display_name || poseName.replace(/_/g, ' ');
    setCurrentPoseDisplayName(displayName);

    setPhase(ExercisePhase.DESCRIPTION);
    const description = pose?.description || "Get ready for the next pose.";
    speak(`Next: ${displayName}. ${description}`);
    phaseTimeoutRef.current = window.setTimeout(() => {
      setPhase(ExercisePhase.IMAGE);
      phaseTimeoutRef.current = window.setTimeout(() => {
        setPhase(ExercisePhase.CORRECTION);
        speak(`Hold ${displayName}.`);
      }, IMAGE_DISPLAY_TIME * 1000);
    }, DESCRIPTION_DISPLAY_TIME * 1000);
  }, [config, currentPoseIndex, phase, speak, stopTTS, onPoseInitError]);


  const resetWorkout = useCallback(() => {
    clearPhaseTimeout();
    stopTTS();
    // Don't reset to IDLE if config isn't loaded or pose init failed
    if (config && phase !== ExercisePhase.INITIALIZING_POSE && phase !== ExercisePhase.POSE_INIT_ERROR && phase !== ExercisePhase.LOADING_CONFIG && phase !== ExercisePhase.CONFIG_ERROR) {
        setPhase(ExercisePhase.IDLE);
    }
    setCurrentPoseIndex(-1);
    setCurrentPoseData(null);
    setCurrentPoseDisplayName("");
    setAngleDetails([]);
    setFeedbackMessages([]);
    setHoldStartTime(null);
    setHoldProgress(0);
  }, [stopTTS, config, phase]);


  const processFrameLandmarks = useCallback((
    landmarks: PoseLandmarks, // Type is NormalizedLandmarkList | null
    frameWidth: number, 
    frameHeight: number
  ) => {
    if (phase !== ExercisePhase.CORRECTION || !currentPoseData || !config) {
      if (holdStartTime) setHoldStartTime(null); 
      setHoldProgress(prev => holdStartTime === null ? 0 : prev); 
      return;
    }

    if (!landmarks || landmarks.length === 0) { // landmarks is NormalizedLandmarkList (an array)
      setFeedbackMessages(["Cannot see you clearly. Adjust your position."]);
      setAngleDetails([]);
      if (holdStartTime) setHoldStartTime(null);
      setHoldProgress(0);
      return;
    }

    // landmarks is NormalizedLandmarkList (i.e., results.landmarks[0] from PoseLandmarkerResult)
    const { angleDetails: newAngleDetails, allJointsCorrect } = checkPoseAngles(
      landmarks, // Pass NormalizedLandmarkList directly
      currentPoseData.criteria,
      config.joint_definitions,
      frameWidth,
      frameHeight,
      EASY_MODE_TOLERANCE
    );
    setAngleDetails(newAngleDetails);

    const incorrectFeedbacks = newAngleDetails
      .filter(detail => !detail.is_correct && detail.feedback)
      .map(detail => detail.feedback);
    
    setFeedbackMessages(incorrectFeedbacks.slice(0, 2)); 

    if (allJointsCorrect) {
      if (!holdStartTime) {
        setHoldStartTime(Date.now());
        setHoldProgress(0);
      } else {
        const elapsed = (Date.now() - holdStartTime) / 1000;
        const progress = Math.min(elapsed / POSE_HOLD_SECONDS, 1);
        setHoldProgress(progress);
        if (elapsed >= POSE_HOLD_SECONDS) {
          speak("Great!");
          setHoldStartTime(null); 
          setHoldProgress(0);
          startNextPose(); 
        }
      }
    } else {
      if (holdStartTime) setHoldStartTime(null);
      setHoldProgress(0);
    }
  }, [phase, currentPoseData, config, holdStartTime, speak, startNextPose]);
  
  useEffect(() => {
    return () => clearPhaseTimeout();
  }, []);

  return {
    phase,
    currentPoseData,
    currentPoseDisplayName,
    angleDetails,
    feedbackMessages,
    holdProgress,
    startNextPose,
    processFrameLandmarks,
    resetWorkout,
    setPhaseManually,
  };
};

export default useExerciseLogic;