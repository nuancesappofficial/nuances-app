import {
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = {
  active: boolean;
  tooltip: string;
  children: React.ReactElement;
  style?: StyleProp<ViewStyle>;
  onSpotlightPress: () => void;
};

export default function TutorialSpotlight({
  children,
  style,
}: Props) {
  return <View style={style}>{children}</View>;
}
