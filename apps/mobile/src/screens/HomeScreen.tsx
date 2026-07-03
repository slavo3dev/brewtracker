import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { supabase } from '../lib/supabase';

type Props = {
	onClockInPress: () => void;
};

export default function HomeScreen({ onClockInPress }: Props) {
	async function handleLogout() {
		await supabase.auth.signOut();
	}

	return (
		<SafeAreaView style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.greeting}>Good morning ☕</Text>
				<Pressable onPress={handleLogout}>
					<Text style={styles.logout}>Log out</Text>
				</Pressable>
			</View>

			<Pressable style={styles.card} onPress={onClockInPress}>
				<Text style={styles.cardTitle}>Clock In</Text>
				<Text style={styles.cardSubtitle}>Start your shift</Text>
			</Pressable>

			<View style={[styles.card, styles.cardDisabled]}>
				<Text style={styles.cardTitle}>Today's Route</Text>
				<Text style={styles.cardSubtitle}>Coming soon — ROUTE-3</Text>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5ede1',
		paddingHorizontal: 20,
		paddingTop: 16,
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 28,
	},
	greeting: {
		fontSize: 22,
		fontWeight: '700',
		color: '#4a2c1a',
	},
	logout: {
		color: '#b3413e',
		fontSize: 14,
		fontWeight: '600',
	},
	card: {
		backgroundColor: '#ffffff',
		borderRadius: 16,
		padding: 20,
		marginBottom: 14,
		borderWidth: 1,
		borderColor: '#e3d4c0',
	},
	cardDisabled: {
		opacity: 0.5,
	},
	cardTitle: {
		fontSize: 17,
		fontWeight: '600',
		color: '#2e1d12',
	},
	cardSubtitle: {
		fontSize: 13,
		color: '#8a6f53',
		marginTop: 4,
	},
});
