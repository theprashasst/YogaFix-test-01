
import React, { useState } from 'react';
import { PLACEHOLDER_IMAGE_SVG } from '../constants';

interface PoseImageProps {
  imagePath?: string;
  poseName: string;
}

const PoseImage: React.FC<PoseImageProps> = ({ imagePath, poseName }) => {
  const [imgSrc, setImgSrc] = useState(imagePath || PLACEHOLDER_IMAGE_SVG);

  React.useEffect(() => {
    setImgSrc(imagePath || PLACEHOLDER_IMAGE_SVG);
  }, [imagePath]);

  const handleError = () => {
    setImgSrc(PLACEHOLDER_IMAGE_SVG);
  };

  return (
    <div className="flex flex-col items-center justify-center bg-black bg-opacity-50 p-4 rounded-lg shadow-xl">
      <h2 className="text-2xl font-semibold mb-4 text-teal-300">{poseName}</h2>
      <img
        src={imgSrc}
        alt={`Pose: ${poseName}`}
        className="max-w-full max-h-[calc(100vh-200px)] object-contain rounded-md border-2 border-gray-700"
        style={{ maxHeight: '70vh', maxWidth: '70vw' }}
        onError={handleError}
      />
    </div>
  );
};

export default PoseImage;
    