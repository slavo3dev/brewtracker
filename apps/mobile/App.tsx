import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, Text } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ClockInScreen from './src/screens/ClockInScreen';

type Screen = 'home' | 'clockIn';

export default function App() {
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	const [screen, setScreen] = useState<Screen>('home');
	const [initError, setInitError] = useState<string | null>(null);

	useEffect(() => {
		supabase.auth
			.getSession()
			.then(({ data, error }) => {
				if (error) {
					setInitError(error.message);
				}
				setSession(data.session);
				setLoading(false);
			})
			.catch((err) => {
				setInitError(
					err?.message ?? 'Unknown error initializing Supabase',
				);
				setLoading(false);
			});

		const { data: listener } = supabase.auth.onAuthStateChange(
			(_event, session) => {
				setSession(session);
			},
		);

		return () => listener.subscription.unsubscribe();
	}, []);

	if (loading) {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: 'center',
					alignItems: 'center',
				}}>
				<ActivityIndicator size='large' color='#7a3f2c' />
			</View>
		);
	}

	if (initError) {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: 'center',
					alignItems: 'center',
					padding: 24,
				}}>
				<Text
					style={{
						color: '#b3413e',
						fontSize: 16,
						textAlign: 'center',
					}}>
					Supabase init error:{'\n'}
					{initError}
				</Text>
			</View>
		);
	}

	return (
		<>
			<StatusBar style='dark' />
			{!session ? (
				<LoginScreen onLoggedIn={() => setScreen('home')} />
			) : screen === 'home' ? (
				<HomeScreen onClockInPress={() => setScreen('clockIn')} />
			) : (
				<ClockInScreen onBack={() => setScreen('home')} />
			)}
		</>
	);
}
