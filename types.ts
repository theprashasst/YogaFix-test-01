
export interface NormalizedLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number; // Provided by newer models
}

export type NormalizedLandmarkList = NormalizedLandmark[];

export interface JointLandmarks {
  A: string; // Landmark name (e.g., "LEFT_SHOULDER")
  B: string;
  C: string;
}

export interface JointDefinition {
  landmarks: JointLandmarks;
}

export interface JointCriterion {
  angle_range: [number, number]; // [min_angle, max_angle]
  feedback: {
    below_min: string;
    above_max: string;
  };
}

export interface PoseData {
  display_name?: string;
  description?: string;
  image_path?: string; // URL to the image
  criteria: {
    [jointName: string]: JointCriterion;
  };
}

export interface ExerciseConfig {
  joint_definitions: {
    [jointName: string]: JointDefinition;
  };
  poses: {
    [poseName: string]: PoseData;
  };
  sequence: string[]; // Array of pose names
}

export interface LandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface AngleDetail {
  name: string;
  angle: number;
  is_correct: boolean;
  feedback: string;
  p1: { x: number; y: number }; // Screen coordinates
  p2: { x: number; y: number };
  p3: { x: number; y: number };
  color: string;
}

export type PoseLandmarks = NormalizedLandmarkList | null; // Updated type

export enum ExercisePhase {
  IDLE = "IDLE",
  LOADING_CONFIG = "LOADING_CONFIG",
  CONFIG_ERROR = "CONFIG_ERROR",
  INITIALIZING_POSE = "INITIALIZING_POSE", // New phase for pose landmarker setup
  POSE_INIT_ERROR = "POSE_INIT_ERROR", // New phase for pose landmarker setup error
  DESCRIPTION = "DESCRIPTION",
  IMAGE = "IMAGE",
  CORRECTION = "CORRECTION",
  COMPLETED = "COMPLETED",
  CAMERA_ERROR = "CAMERA_ERROR",
}