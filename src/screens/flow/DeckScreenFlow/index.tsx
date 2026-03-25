import React from 'react';
import DeckMainFlow from './DeckMainFlow';

type Props = {
  navigation: any;
};

export default function DeckScreenFlow({ navigation }: Props) {
  return <DeckMainFlow navigation={navigation} />;
}
