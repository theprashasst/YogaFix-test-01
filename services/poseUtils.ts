import { NormalizedLandmark, NormalizedLandmarkList, AngleDetail, JointCriterion, JointDefinition, LandmarkPoint } from '../types';
import { COLOR_CORRECT, COLOR_INCORRECT, EASY_MODE_TOLERANCE } from '../constants';

/**
 * Calculates the angle between three points (in degrees).
 */
export function calculateAngle(p1: LandmarkPoint, p2: LandmarkPoint, p3: LandmarkPoint): number {
  const p1_np = [p1.x, p1.y];
  const p2_np = [p2.x, p2.y];
  const p3_np = [p3.x, p3.y];

  const ba = [p1_np[0] - p2_np[0], p1_np[1] - p2_np[1]];
  const bc = [p3_np[0] - p2_np[0], p3_np[1] - p2_np[1]];

  const dotProduct = ba[0] * bc[0] + ba[1] * bc[1];
  const magBa = Math.sqrt(ba[0] * ba[0] + ba[1] * ba[1]);
  const magBc = Math.sqrt(bc[0] * bc[0] + bc[1] * bc[1]);

  if (magBa === 0 || magBc === 0) return 0.0;

  let cosAngle = dotProduct / (magBa * magBc);
  cosAngle = Math.max(-1.0, Math.min(1.0, cosAngle)); // Clip to avoid acos domain error

  const angleRad = Math.acos(cosAngle);
  return (angleRad * 180) / Math.PI;
}

// Helper to map string landmark names from config to MediaPipe PoseLandmark enum indices
function getLandmarkIndex(name: string): number {
  const upperName = name.toUpperCase();
  // Access PoseLandmark enum via window.mpVision
  if (window.mpVision && window.mpVision.PoseLandmarker && window.mpVision.PoseLandmarker.PoseLandmark) {
    const poseLandmarkEnum = window.mpVision.PoseLandmarker.PoseLandmark;
    if (upperName in poseLandmarkEnum) {
      return poseLandmarkEnum[upperName as keyof typeof poseLandmarkEnum];
    }
  }
  console.warn(`Unknown landmark name or PoseLandmark enum not available: ${name}`);
  return -1; // Or throw error
}


/**
 * Checks pose angles against criteria.
 * Returns angle details for drawing and whether all joints are correct.
 */
export function checkPoseAngles(
  landmarksMp: NormalizedLandmarkList, // This is NormalizedLandmark[]
  poseCriteria: { [jointName: string]: JointCriterion },
  jointDefinitions: { [jointName: string]: JointDefinition },
  frameW: number,
  frameH: number,
  tolerance: number = EASY_MODE_TOLERANCE
): { angleDetails: AngleDetail[], allJointsCorrect: boolean } {
  const angleDetails: AngleDetail[] = [];
  let allJointsCorrect = true;

  for (const jointName in poseCriteria) {
    if (!poseCriteria.hasOwnProperty(jointName)) continue;
    
    const criterion = poseCriteria[jointName];
    const jointDef = jointDefinitions[jointName];

    if (!jointDef) {
      console.warn(`Joint definition for '${jointName}' not found.`);
      allJointsCorrect = false;
      continue;
    }

    const lmIdxA = getLandmarkIndex(jointDef.landmarks.A);
    const lmIdxB = getLandmarkIndex(jointDef.landmarks.B);
    const lmIdxC = getLandmarkIndex(jointDef.landmarks.C);

    if (lmIdxA === -1 || lmIdxB === -1 || lmIdxC === -1) {
        allJointsCorrect = false;
        angleDetails.push({
            name: jointName,
            angle: -1,
            is_correct: false,
            feedback: `Landmark definition error for ${jointName.replace(/_/g, ' ')}.`,
            p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, p3: { x: 0, y: 0 },
            color: COLOR_INCORRECT,
        });
        continue;
    }
    
    const lmA_obj: NormalizedLandmark | undefined = landmarksMp[lmIdxA];
    const lmB_obj: NormalizedLandmark | undefined = landmarksMp[lmIdxB];
    const lmC_obj: NormalizedLandmark | undefined = landmarksMp[lmIdxC];

    if (!lmA_obj || !lmB_obj || !lmC_obj) {
      allJointsCorrect = false; // Missing landmarks means incorrect
      angleDetails.push({
          name: jointName,
          angle: -1,
          is_correct: false,
          feedback: `${jointName.replace(/_/g, ' ')} points not found on body.`,
          p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 }, p3: { x: 0, y: 0 },
          color: COLOR_INCORRECT,
      });
      continue;
    }
    
    const visThreshold = 0.3; // Visibility threshold
    let currentAngle: number;
    let isCorrect: boolean;
    let feedbackMsg = "";
    let color = COLOR_INCORRECT;

    if (
      !(lmA_obj.visibility && lmA_obj.visibility > visThreshold &&
        lmB_obj.visibility && lmB_obj.visibility > visThreshold &&
        lmC_obj.visibility && lmC_obj.visibility > visThreshold)
    ) {
      currentAngle = -1; // Indicate low visibility
      isCorrect = false;
      feedbackMsg = `${jointName.replace(/_/g, ' ')} not clearly visible.`;
      allJointsCorrect = false;
    } else {
      // Note: landmarksMp are already normalized (0.0 to 1.0)
      // For calculateAngle, we use these normalized coordinates directly.
      // The scaling to frameW/frameH is done later when storing p1, p2, p3 for drawing.
      const p1_norm: LandmarkPoint = { x: lmA_obj.x, y: lmA_obj.y };
      const p2_norm: LandmarkPoint = { x: lmB_obj.x, y: lmB_obj.y };
      const p3_norm: LandmarkPoint = { x: lmC_obj.x, y: lmC_obj.y };
      
      currentAngle = calculateAngle(p1_norm, p2_norm, p3_norm);
      const [minAngle, maxAngle] = criterion.angle_range;

      isCorrect = currentAngle >= (minAngle - tolerance) && currentAngle <= (maxAngle + tolerance);
      color = isCorrect ? COLOR_CORRECT : COLOR_INCORRECT;

      if (!isCorrect) {
        allJointsCorrect = false;
        if (currentAngle < (minAngle - tolerance)) {
          feedbackMsg = criterion.feedback.below_min;
        } else {
          feedbackMsg = criterion.feedback.above_max;
        }
      }
    }

    angleDetails.push({
      name: jointName,
      angle: currentAngle,
      is_correct: isCorrect,
      feedback: feedbackMsg,
      p1: { x: lmA_obj.x * frameW, y: lmA_obj.y * frameH }, // Scale here for drawing
      p2: { x: lmB_obj.x * frameW, y: lmB_obj.y * frameH },
      p3: { x: lmC_obj.x * frameW, y: lmC_obj.y * frameH },
      color: color,
    });
  }
  return { angleDetails, allJointsCorrect };
}


export function wrapText(text: string, lineLength: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
      if (currentLine.length + word.length + 1 <= lineLength) {
          currentLine += word + " ";
      } else {
          lines.push(currentLine.trim());
          currentLine = word + " ";
      }
  }
  lines.push(currentLine.trim());
  return lines;
}