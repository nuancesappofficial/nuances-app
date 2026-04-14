import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const CARD_WIDTH = SCREEN_WIDTH * 0.99;
export const SPACING = 8;
export const SNAP_INTERVAL = CARD_WIDTH + SPACING;
export const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2 - SPACING / 2;
export const SIDE_PEEK_SHIFT = 60;
