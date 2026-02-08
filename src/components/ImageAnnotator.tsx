// Image Annotation Component
// Allows users to draw bounding boxes on images

import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  PanResponder,
  Text,
} from 'react-native';
import Svg, { Rect } from 'react-native-svg';

type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  imageUri: string;
  onAnnotationsChange: (boxes: BoundingBox[]) => void;
};

export default function ImageAnnotator({ imageUri, onAnnotationsChange }: Props) {
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);

  const screenWidth = Dimensions.get('window').width - 32;
  const imageHeight = 300;

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      setStartPoint({ x: locationX, y: locationY });
      setCurrentBox({
        x: locationX,
        y: locationY,
        width: 0,
        height: 0,
      });
    },
    onPanResponderMove: (evt) => {
      if (!startPoint) return;
      
      const { locationX, locationY } = evt.nativeEvent;
      const width = locationX - startPoint.x;
      const height = locationY - startPoint.y;

      setCurrentBox({
        x: Math.min(startPoint.x, locationX),
        y: Math.min(startPoint.y, locationY),
        width: Math.abs(width),
        height: Math.abs(height),
      });
    },
    onPanResponderRelease: () => {
      if (currentBox && currentBox.width > 20 && currentBox.height > 20) {
        const newBoxes = [...boxes, currentBox];
        setBoxes(newBoxes);
        onAnnotationsChange(newBoxes);
      }
      setCurrentBox(null);
      setStartPoint(null);
    },
  });

  const handleRemoveLastBox = () => {
    const newBoxes = boxes.slice(0, -1);
    setBoxes(newBoxes);
    onAnnotationsChange(newBoxes);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.instructions}>
        📝 在圖片上拖動來標註區域（{boxes.length} 個標註）
      </Text>
      
      <View style={styles.imageContainer} {...panResponder.panHandlers}>
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, { width: screenWidth, height: imageHeight }]}
          resizeMode="contain"
        />
        
        <Svg
          style={StyleSheet.absoluteFill}
          width={screenWidth}
          height={imageHeight}
        >
          {/* Existing boxes */}
          {boxes.map((box, index) => (
            <Rect
              key={index}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              stroke="#4CAF50"
              strokeWidth={2}
              fill="rgba(76, 175, 80, 0.2)"
            />
          ))}
          
          {/* Current drawing box */}
          {currentBox && (
            <Rect
              x={currentBox.x}
              y={currentBox.y}
              width={currentBox.width}
              height={currentBox.height}
              stroke="#FF5722"
              strokeWidth={2}
              fill="rgba(255, 87, 34, 0.2)"
            />
          )}
        </Svg>
      </View>

      {boxes.length > 0 && (
        <Text style={styles.hint} onPress={handleRemoveLastBox}>
          ↩️ 點擊移除最後一個標註
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  instructions: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  image: {
    backgroundColor: '#f0f0f0',
  },
  hint: {
    fontSize: 12,
    color: '#2196F3',
    marginTop: 8,
    textAlign: 'center',
  },
});
