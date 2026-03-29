import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import ImageOCRViewer from '../../ImageOCRViewer';
import { type OCRBlock } from '../../../services/ocr/ocrService';

type Props = {
  visible: boolean;
  noShellQuickFlow: boolean;
  selectedImage: string | null;
  ocrBlocks: OCRBlock[];
  selectedBlockIndexes: number[];
  learningGoal: 'ielts' | 'casual' | 'professional';
  keywords: string;
  onCloseRequest: () => void;
  onDonePress: () => void;
  onSelectionChange: (indexes: number[], blocks: OCRBlock[]) => void;
  onOCRComplete: (blocks: OCRBlock[]) => void;
  onKeywordsChange: (nextKeywords: string) => void;
};

export default function OCRViewerModalUI({
  visible,
  noShellQuickFlow,
  selectedImage,
  ocrBlocks,
  selectedBlockIndexes,
  learningGoal,
  keywords,
  onCloseRequest,
  onDonePress,
  onSelectionChange,
  onOCRComplete,
  onKeywordsChange,
}: Props) {
  return (
    <Modal
      visible={visible}
      animationType={noShellQuickFlow ? 'none' : 'slide'}
      onRequestClose={onCloseRequest}
      presentationStyle="fullScreen"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onDonePress} style={styles.modalCloseButton}>
            <Text style={styles.modalCloseText}>✓ 完成</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>選擇要學習的文字</Text>
          <Text style={styles.modalCloseText}>
            {selectedBlockIndexes.length > 0 ? `已選 ${selectedBlockIndexes.length}` : `${ocrBlocks.length} 個`}
          </Text>
        </View>

        {selectedImage ? (
          <ImageOCRViewer
            imageUri={selectedImage}
            onSelectionChange={onSelectionChange}
            onOCRComplete={onOCRComplete}
            initialSelectedIndexes={selectedBlockIndexes}
            learningGoal={learningGoal}
            keywords={keywords}
            onKeywordsChange={onKeywordsChange}
          />
        ) : (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ 圖片載入失敗</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalCloseButton: {
    paddingVertical: 8,
  },
  modalCloseText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
  },
});
