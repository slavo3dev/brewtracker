import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native';
import { useGeofence } from '../hooks/useGeofence';

type Props = {
	onBack: () => void;
	onClockedIn: () => void;
};

export default function ClockInScreen({ onBack, onClockedIn }: Props) {
	const { status, distanceMeters, nearestLabel, errorMessage } =
		useGeofence();

	const canClockIn = status === 'in_range';

	function reasonText(): string {
		switch (status) {
			case 'checking_permission':
				return 'Checking location permission…';
			case 'permission_denied':
				return 'Location permission denied. Enable it in Settings to clock in.';
			case 'locating':
				return 'Getting your location…';
			case 'out_of_range':
				return distanceMeters != null && nearestLabel
					? `You're ${(distanceMeters / 1000).toFixed(1)}km from ${nearestLabel}`
					: "You're outside the allowed area.";
			case 'error':
				return errorMessage ?? 'Location error.';
			case 'in_range':
				return "You're in range — ready to clock in.";
			default:
				return '';
		}
	}

	return (
		<SafeAreaView style={styles.container}>
			<Pressable onPress={onBack}>
				<Text style={styles.back}>← Back</Text>
			</Pressable>

			<View style={styles.center}>
				<Text style={styles.title}>Clock In</Text>

				<View
					style={[
						styles.statusBadge,
						canClockIn
							? styles.statusBadgeOk
							: styles.statusBadgeWarn,
					]}>
					<Text
						style={[
							styles.statusText,
							canClockIn
								? styles.statusTextOk
								: styles.statusTextWarn,
						]}>
						{reasonText()}
					</Text>
				</View>

				<Pressable
					style={[
						styles.button,
						!canClockIn && styles.buttonDisabled,
					]}
					onPress={onClockedIn}
					disabled={!canClockIn}>
					<Text style={styles.buttonText}>
						{canClockIn ? 'Clock In' : 'Clock In (unavailable)'}
					</Text>
				</Pressable>
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
		marginBottom: 20,
	},
	statusBadge: {
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 18,
		marginBottom: 28,
		width: '100%',
	},
	statusBadgeOk: {
		backgroundColor: '#e3efe0',
	},
	statusBadgeWarn: {
		backgroundColor: '#f4e3da',
	},
	statusText: {
		fontSize: 14,
		textAlign: 'center',
		lineHeight: 20,
	},
	statusTextOk: {
		color: '#3a6b3e',
	},
	statusTextWarn: {
		color: '#8a5a3c',
	},
	button: {
		backgroundColor: '#7a3f2c',
		borderRadius: 12,
		paddingVertical: 15,
		paddingHorizontal: 32,
		width: '100%',
		alignItems: 'center',
	},
	buttonDisabled: {
		backgroundColor: '#c9b8a8',
	},
	buttonText: {
		color: '#ffffff',
		fontSize: 16,
		fontWeight: '600',
	},
});
