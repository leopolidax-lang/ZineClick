import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zineclick.app',
  appName: 'ZineClick',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    LocalNotifications: {
      smallIcon: 'ic_stat_zynora',
      iconColor: '#8B5CF6'
    }
  }
};

export default config;
