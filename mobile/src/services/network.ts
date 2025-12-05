// src/services/network.ts
import NetInfo from '@react-native-community/netinfo';

export async function getNetworkStatus() {
  const state = await NetInfo.fetch();
  const details = state.details as any;
  const isExpensive = details?.isConnectionExpensive;

  const isConnected =
    !!state.isConnected && !!state.isInternetReachable;

  const isUnmetered =
    state.type === 'wifi' && isExpensive !== true;

  return {state, isConnected, isUnmetered};
}

export async function hasInternet(): Promise<boolean> {
  const {isConnected} = await getNetworkStatus();
  return isConnected;
}