import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';

type Props = {
	onBack: () => void;
};

export default function ClockInScreen({ onBack }: Props) {
	return (
		<SafeAreaView style={styles.container}>
			<Pressable onPress={onBack}>
				<Text style={styles.back}>← Back</Text>
			</Pressable>

			<View style={styles.center}>
				<Text style={styles.title}>Clock In</Text>
				<Text style={styles.subtitle}>
					Geofence check & selfie capture coming next{'\n'}(AUTH-3,
					AUTH-4, AUTH-5)
				</Text>
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
	back: {
		color: '#7a3f2c',
		fontSize: 16,
		fontWeight: '600',
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 24,
	},
	title: {
		fontSize: 24,
		fontWeight: '700',
		color: '#4a2c1a',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 14,
		color: '#8a6f53',
		textAlign: 'center',
		lineHeight: 20,
	},
});
