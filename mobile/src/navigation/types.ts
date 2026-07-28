import { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Dialer: undefined;
  Recents: undefined;
  Messages: undefined;
  Contacts: undefined;
  Voicemail: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
  Thread: { phone: string; display: string };
  Call: undefined;
  Settings: undefined;
};
