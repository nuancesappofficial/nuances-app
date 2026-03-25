import React from 'react';
import ProfileMainFlow from './ProfileMainFlow';

type Props = {
  navigation: any;
};

export default function ProfileScreenFlow({ navigation }: Props) {
  return <ProfileMainFlow navigation={navigation} />;
}
