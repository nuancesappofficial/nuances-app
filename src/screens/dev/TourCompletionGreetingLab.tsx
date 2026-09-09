import React from 'react';
import { View } from 'react-native';
import TourCompletionGreetingUI from '../../components/UI/DeckScreenUI/TourCompletionGreetingUI';

export default function TourCompletionGreetingLab({
  onClose,
}: {
  onClose: () => void;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: '#09111F' }}>
      <TourCompletionGreetingUI
        visible
        title="不開app就能儲存"
        uploadLabel="立即上傳"
        onClose={onClose}
        onUpload={onClose}
      />
    </View>
  );
}
