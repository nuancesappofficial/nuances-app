// Main Navigation Component
import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CacheListScreen from '../screens/CacheListScreen';
import CardsListScreen from '../screens/CardsListScreen';
import AddCacheItemScreen from '../screens/AddCacheItemScreen';
import CreateCardScreen from '../screens/CreateCardScreen';
import CardReviewScreen from '../screens/CardReviewScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Cache Stack Navigator
function CacheStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CacheList" component={CacheListScreen} />
      <Stack.Screen 
        name="AddCacheItem" 
        component={AddCacheItemScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen 
        name="CreateCard" 
        component={CreateCardScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

// Cards Stack Navigator
function CardsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CardsList" component={CardsListScreen} />
      <Stack.Screen 
        name="CardReview" 
        component={CardReviewScreen}
        options={{ presentation: 'card' }}
      />
    </Stack.Navigator>
  );
}

type RootNavigatorProps = {
  isExpoGo?: boolean;
};

export default function RootNavigator({ isExpoGo: _isExpoGo }: RootNavigatorProps) {
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
          component={CacheStack}
          options={{
            tabBarLabel: '快取',
            tabBarIcon: ({ color }) => (
              <TabIcon emoji="📚" color={color} />
            ),
          }}
        />
        
        <Tab.Screen
          name="Cards"
          component={CardsStack}
          options={{
            tabBarLabel: '卡片',
            tabBarIcon: ({ color }) => (
              <TabIcon emoji="📇" color={color} />
            ),
          }}
        />

        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarLabel: '設定',
            tabBarIcon: ({ color }) => (
              <TabIcon emoji="⚙️" color={color} />
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
