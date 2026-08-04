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
        title="現在換你了"
        body="上傳你想學的內容，或從 iOS 分享選單把文字、圖片傳到 Nuances。"
        shareLabel="我會用分享選單"
        uploadLabel="立即上傳"
        onShare={onClose}
        onUpload={onClose}
      />
    </View>
  );
}
