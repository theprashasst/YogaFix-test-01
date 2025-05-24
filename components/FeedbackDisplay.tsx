
import React from 'react';
import { COLOR_PROGRESS_BAR_BG, COLOR_PROGRESS_BAR_FG, COLOR_TEXT } from '../constants';

interface FeedbackDisplayProps {
  messages: string[];
  holdProgress: number; // 0 to 1
  currentPoseName?: string;
}

const FeedbackDisplay: React.FC<FeedbackDisplayProps> = ({ messages, holdProgress, currentPoseName }) => {
  return (
    <div className="absolute bottom-4 left-4 right-4 md:left-8 md:right-auto md:max-w-md p-4 bg-black bg-opacity-70 rounded-lg shadow-2xl space-y-3">
      {currentPoseName && (
        <h3 className="text-xl font-semibold text-teal-400">Current: {currentPoseName}</h3>
      )}
      
      {/* Progress Bar */}
      <div className="w-full">
        <div className="text-sm font-medium text-gray-300 mb-1">Hold Progress: {Math.round(holdProgress * 100)}%</div>
        <div className="w-full h-6 rounded-full" style={{ backgroundColor: COLOR_PROGRESS_BAR_BG }}>
          <div
            className="h-6 rounded-full transition-all duration-300 ease-linear"
            style={{ width: `${holdProgress * 100}%`, backgroundColor: COLOR_PROGRESS_BAR_FG }}
          ></div>
        </div>
      </div>

      {/* Feedback Messages */}
      {messages.length > 0 && (
        <div className="space-y-1">
          {messages.map((msg, index) => (
            <p key={index} className="text-sm text-red-400 leading-tight">
              {msg}
            </p>
          ))}
        </div>
      )}
      {messages.length === 0 && holdProgress < 1 && currentPoseName && (
         <p className="text-sm text-green-400">Looking good! Keep holding.</p>
      )}
    </div>
  );
};

export default FeedbackDisplay;
    