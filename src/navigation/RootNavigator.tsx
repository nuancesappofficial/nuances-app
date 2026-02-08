// Main Navigation Component
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import CacheListScreen from '../screens/CacheListScreen';
import CardsListScreen from '../screens/CardsListScreen';

const Tab = createBottomTabNavigator();

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#4CAF50',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            paddingBottom: 8,
            paddingTop: 8,
            height: 60,
          },
        }}
      >
        <Tab.Screen
          name="Cache"
          component={CacheListScreen}
          options={{
            tabBarLabel: '快取',
            tabBarIcon: ({ color, size }) => (
              <TabIcon emoji="📚" color={color} />
            ),
          }}
        />
        
        <Tab.Screen
          name="Cards"
          component={CardsListScreen}
          options={{
            tabBarLabel: '卡片',
            tabBarIcon: ({ color, size }) => (
              <TabIcon emoji="📇" color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

// Simple emoji icon component
function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return (
    <Text style={{ fontSize: 24, color }}>{emoji}</Text>
  );
}

import { Text } from 'react-native';
