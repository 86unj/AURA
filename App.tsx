import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthScreen } from "./src/screens/AuthScreen";
import { CameraScreen } from "./src/screens/CameraScreen";
import { AuraReportScreen } from "./src/screens/AuraReportScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { DailyAuraScreen } from "./src/screens/DailyAuraScreen";
import { RemoteCameraScreen } from "./src/screens/RemoteCameraScreen";
import { AuraLabScreen } from "./src/screens/AuraLabScreen";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { RootStackParamList } from "./src/navigation/types";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "transparent",
  },
};

function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return null;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "#05070c",
        },
      }}
    >
      {session ? (
        <>
          <Stack.Screen name="Camera" component={CameraScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="AuraReport" component={AuraReportScreen} />
          <Stack.Screen name="DailyAura" component={DailyAuraScreen} />
          <Stack.Screen name="RemoteCamera" component={RemoteCameraScreen} />
          <Stack.Screen name="AuraLab" component={AuraLabScreen} />
        </>
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer theme={navigationTheme}>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
