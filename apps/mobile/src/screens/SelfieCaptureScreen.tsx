import { useRef, useState } from 'react';
import {
	View,
	Text,
	Pressable,
	StyleSheet,
	SafeAreaView,
	Image,
} from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';

type Props = {
	onBack: () => void;
	onConfirmed: (photoUri: string) => void;
};

export default function SelfieCaptureScreen({ onBack, onConfirmed }: Props) {
	const [permission, requestPermission] = useCameraPermissions();
	const [capturedUri, setCapturedUri] = useState<string | null>(null);
	const cameraRef = useRef<CameraView>(null);
	const facing: CameraType = 'front';

	if (!permission) {
		return (
			<SafeAreaView style={styles.container}>
				<Text style={styles.message}>Checking camera permission…</Text>
			</SafeAreaView>
		);
	}

	if (!permission.granted) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.center}>
					<Text style={styles.message}>
						Camera access is required to clock in.
					</Text>
					<Pressable
						style={styles.button}
						onPress={requestPermission}>
						<Text style={styles.buttonText}>
							Grant Camera Access
						</Text>
					</Pressable>
					<Pressable onPress={onBack}>
						<Text style={styles.back}>← Back</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	async function takePicture() {
		const photo = await cameraRef.current?.takePictureAsync({
			quality: 0.7,
		});
		if (photo?.uri) {
			setCapturedUri(photo.uri);
		}
	}

	if (capturedUri) {
		return (
			<SafeAreaView style={styles.container}>
				<View style={styles.center}>
					<Text style={styles.title}>Confirm Photo</Text>
					<Image
						source={{ uri: capturedUri }}
						style={styles.preview}
					/>

					<Pressable
						style={styles.button}
						onPress={() => onConfirmed(capturedUri)}>
						<Text style={styles.buttonText}>
							Confirm & Clock In
						</Text>
					</Pressable>
					<Pressable onPress={() => setCapturedUri(null)}>
						<Text style={styles.retake}>Retake</Text>
					</Pressable>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.container}>
			<CameraView ref={cameraRef} style={styles.camera} facing={facing} />
			<View style={styles.controls}>
				<Pressable onPress={onBack}>
					<Text style={styles.back}>← Back</Text>
				</Pressable>
				<Pressable style={styles.captureButton} onPress={takePicture}>
					<View style={styles.captureButtonInner} />
				</Pressable>
				<View style={{ width: 60 }} />
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#1a1410',
	},
	camera: {
		flex: 1,
	},
	controls: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 24,
		paddingVertical: 20,
		backgroundColor: '#1a1410',
	},
	captureButton: {
		width: 70,
		height: 70,
		borderRadius: 35,
		borderWidth: 4,
		borderColor: '#ffffff',
		justifyContent: 'center',
		alignItems: 'center',
	},
	captureButtonInner: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: '#ffffff',
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingHorizontal: 24,
		backgroundColor: '#f5ede1',
	},
	title: {
		fontSize: 22,
		fontWeight: '700',
		color: '#4a2c1a',
		marginBottom: 20,
	},
	message: {
		color: '#4a2c1a',
		fontSize: 15,
		textAlign: 'center',
		marginBottom: 20,
	},
	preview: {
		width: 220,
		height: 220,
		borderRadius: 16,
		marginBottom: 28,
	},
	button: {
		backgroundColor: '#7a3f2c',
		borderRadius: 12,
		paddingVertical: 15,
		paddingHorizontal: 32,
		marginBottom: 16,
	},
	buttonText: {
		color: '#ffffff',
		fontSize: 16,
		fontWeight: '600',
	},
	back: {
		color: '#ffffff',
		fontSize: 16,
		fontWeight: '600',
	},
	retake: {
		color: '#b3413e',
		fontSize: 15,
		fontWeight: '600',
	},
});
