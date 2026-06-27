import { useState } from 'react';
import {
	View,
	Text,
	TextInput,
	Pressable,
	StyleSheet,
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Props = {
	onLoggedIn: () => void;
};

export default function LoginScreen({ onLoggedIn }: Props) {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleLogin() {
		setError(null);
		setLoading(true);
		const { error } = await supabase.auth.signInWithPassword({
			email,
			password,
		});
		setLoading(false);
		if (error) {
			setError(error.message);
			return;
		}
		onLoggedIn();
	}

	return (
		<KeyboardAvoidingView
			style={styles.container}
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
			<Text style={styles.logo}>☕ BrewTracker</Text>
			<Text style={styles.subtitle}>Driver & Tech Login</Text>

			<TextInput
				style={styles.input}
				placeholder='Email'
				placeholderTextColor='#9a8a7a'
				autoCapitalize='none'
				keyboardType='email-address'
				value={email}
				onChangeText={setEmail}
			/>
			<TextInput
				style={styles.input}
				placeholder='Password'
				placeholderTextColor='#9a8a7a'
				secureTextEntry
				value={password}
				onChangeText={setPassword}
			/>

			{error && <Text style={styles.error}>{error}</Text>}

			<Pressable
				style={({ pressed }) => [
					styles.button,
					pressed && styles.buttonPressed,
				]}
				onPress={handleLogin}
				disabled={loading}>
				{loading ? (
					<ActivityIndicator color='#fff' />
				) : (
					<Text style={styles.buttonText}>Sign In</Text>
				)}
			</Pressable>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5ede1',
		justifyContent: 'center',
		paddingHorizontal: 28,
	},
	logo: {
		fontSize: 32,
		fontWeight: '700',
		color: '#4a2c1a',
		textAlign: 'center',
	},
	subtitle: {
		fontSize: 14,
		color: '#8a6f53',
		textAlign: 'center',
		marginTop: 4,
		marginBottom: 36,
	},
	input: {
		backgroundColor: '#ffffff',
		borderRadius: 12,
		paddingHorizontal: 16,
		paddingVertical: 14,
		fontSize: 16,
		color: '#2e1d12',
		marginBottom: 12,
		borderWidth: 1,
		borderColor: '#e3d4c0',
	},
	error: {
		color: '#b3413e',
		fontSize: 13,
		marginBottom: 12,
		textAlign: 'center',
	},
	button: {
		backgroundColor: '#7a3f2c',
		borderRadius: 12,
		paddingVertical: 15,
		alignItems: 'center',
		marginTop: 8,
	},
	buttonPressed: {
		opacity: 0.85,
	},
	buttonText: {
		color: '#ffffff',
		fontSize: 16,
		fontWeight: '600',
	},
});
