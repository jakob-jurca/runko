import * as SecureStore from 'expo-secure-store'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'
import { createHybridStorage } from './hybrid-storage'

// SecureStore has no web implementation; the browser preview uses AsyncStorage.
export const authStorage = Platform.OS === 'web'
  ? AsyncStorage
  : createHybridStorage(SecureStore, AsyncStorage)
