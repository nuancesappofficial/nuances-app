import {
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onSpotlightPress: () => void;
};

export default function TutorialSpotlight({
  children,
  style,
}: Props) {
  return <View style={style}>{children}</View>;
}
