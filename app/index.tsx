import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  FlatList,
  Platform,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  ScrollView,
  Switch,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import Colors from "@/constants/colors";
import BarcodeView from "@/components/BarcodeView";
import {
  encodeSSCC,
  calculateSSCCCheckDigit,
  BarcodeData,
} from "@/lib/code128";
import { extractSSCCsOnDevice, OCRImageInput } from "@/lib/ocr";

const { palette } = Colors;
const HISTORY_KEY = "sscc_history";
const MANUAL_ONLY_KEY = "manual_only_mode";
const SSCC_PREFIX = "00";
const SSCC_PREFIX_DISPLAY = `${SSCC_PREFIX} `;
const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface HistoryItem {
  id: string;
  sscc: string;
  createdAt: number;
}

type OCRImageSource = "camera" | "gallery";

function formatSSCCDisplay(sscc: string): string {
  return `${SSCC_PREFIX_DISPLAY}${sscc}`;
}

function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isAvailable, setIsAvailable] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setIsAvailable(true);
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if (Platform.OS !== "web") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        finalTranscript += event.results[i][0].transcript;
      }
      const digitsOnly = finalTranscript.replace(/\D/g, "");
      setTranscript(digitsOnly);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setTranscript("");
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  return { isListening, transcript, isAvailable, startListening, stopListening };
}

function HistoryRow({
  item,
  onSelect,
  onDelete,
}: {
  item: HistoryItem;
  onSelect: (s: string) => void;
  onDelete: (id: string) => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={styles.historyRow}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onSelect(item.sscc);
        }}
        onPressIn={() => {
          scale.value = withSpring(0.97);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
      >
        <View style={styles.historyLeft}>
          <MaterialCommunityIcons
            name="barcode"
            size={20}
            color={palette.teal}
          />
          <View style={styles.historyTextContainer}>
            <Text style={styles.historySSCC}>{formatSSCCDisplay(item.sscc)}</Text>
            <Text style={styles.historyDate}>
              {new Date(item.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onDelete(item.id);
          }}
          hitSlop={12}
        >
          <Feather name="trash-2" size={18} color={palette.textTertiary} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

function OCRResultItem({
  sscc,
  onGenerate,
}: {
  sscc: string;
  onGenerate: (s: string) => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        style={styles.ocrResultRow}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onGenerate(sscc);
        }}
        onPressIn={() => {
          scale.value = withSpring(0.97);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
      >
        <View style={styles.ocrResultLeft}>
          <MaterialCommunityIcons
            name="barcode"
            size={22}
            color={palette.teal}
          />
          <View>
            <Text style={styles.ocrResultSSCC}>{formatSSCCDisplay(sscc)}</Text>
            <Text style={styles.ocrResultSub}>Tap to generate barcode</Text>
          </View>
        </View>
        <Feather name="chevron-right" size={20} color={palette.textTertiary} />
      </Pressable>
    </Animated.View>
  );
}

export default function MainScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState("");
  const [barcode, setBarcode] = useState<BarcodeData | null>(null);
  const [currentSSCC, setCurrentSSCC] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResults, setOcrResults] = useState<string[]>([]);
  const [ocrModalVisible, setOcrModalVisible] = useState(false);
  const [manualOnlyMode, setManualOnlyMode] = useState(false);

  const {
    isListening,
    transcript,
    isAvailable,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  const micPulse = useSharedValue(1);
  const barcodeOpacity = useSharedValue(0);

  useEffect(() => {
    if (transcript) {
      setInput(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    if (isListening) {
      micPulse.value = withRepeat(
        withSequence(
          withTiming(1.15, {
            duration: 600,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(micPulse);
      micPulse.value = withSpring(1);
    }
  }, [isListening, micPulse]);

  const micAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micPulse.value }],
  }));

  const barcodeAnimStyle = useAnimatedStyle(() => ({
    opacity: barcodeOpacity.value,
  }));

  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        const [historyData, manualOnlyData] = await Promise.all([
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(MANUAL_ONLY_KEY),
        ]);

        if (historyData) {
          setHistory(JSON.parse(historyData));
        }

        if (manualOnlyData !== null) {
          setManualOnlyMode(manualOnlyData === "true");
        }
      } catch {}
    };

    loadPersistedData();
  }, []);

  const saveHistory = async (items: HistoryItem[]) => {
    try {
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {}
  };

  const saveManualOnlyMode = async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(MANUAL_ONLY_KEY, enabled ? "true" : "false");
    } catch {}
  };

  const toggleManualOnlyMode = async (enabled: boolean) => {
    setManualOnlyMode(enabled);
    await saveManualOnlyMode(enabled);

    if (enabled) {
      if (isListening) {
        stopListening();
      }
      setOcrModalVisible(false);
      setOcrResults([]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const generateBarcodeFromSSCC = useCallback(
    (sscc: string, addToHistory = true) => {
      const encoded = encodeSSCC(sscc);
      setBarcode(encoded);
      setCurrentSSCC(sscc);
      setInput(sscc);
      setError("");
      barcodeOpacity.value = 0;
      barcodeOpacity.value = withTiming(1, { duration: 400 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (addToHistory) {
        const newItem: HistoryItem = {
          id:
            Date.now().toString() +
            Math.random().toString(36).substr(2, 9),
          sscc,
          createdAt: Date.now(),
        };
        setHistory((prev) => {
          const updated = [newItem, ...prev].slice(0, 50);
          saveHistory(updated);
          return updated;
        });
      }
    },
    [barcodeOpacity]
  );

  const generateBarcode = useCallback(() => {
    const digits = input.replace(/\D/g, "");
    setError("");

    if (digits.length < 17 || digits.length > 18) {
      setError(
        "Enter 17 digits (check digit auto-calculated) or full 18 digits"
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    let sscc: string;
    if (digits.length === 17) {
      const checkDigit = calculateSSCCCheckDigit(digits);
      sscc = digits + checkDigit.toString();
    } else {
      const expectedCheck = calculateSSCCCheckDigit(
        digits.substring(0, 17)
      );
      if (parseInt(digits[17], 10) !== expectedCheck) {
        setError(
          `Check digit invalid. Expected ${expectedCheck}, got ${digits[17]}`
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      sscc = digits;
    }

    generateBarcodeFromSSCC(sscc);
  }, [input, generateBarcodeFromSSCC]);

  const selectFromHistory = useCallback(
    (sscc: string) => {
      generateBarcodeFromSSCC(sscc, false);
    },
    [generateBarcodeFromSSCC]
  );

  const deleteFromHistory = useCallback(
    (id: string) => {
      const updated = history.filter((h) => h.id !== id);
      setHistory(updated);
      saveHistory(updated);
    },
    [history]
  );

  const copyToClipboard = async () => {
    if (!currentSSCC) return;
    await Clipboard.setStringAsync(formatSSCCDisplay(currentSSCC));
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMicPress = () => {
    if (manualOnlyMode) {
      Alert.alert(
        "Manual-Only Mode",
        "Voice and OCR are disabled. Type the SSCC digits manually."
      );
      return;
    }

    if (Platform.OS !== "web") {
      Alert.alert(
        "Voice Input",
        "Use your keyboard\u2019s built-in microphone button for voice input on this device.",
        [{ text: "OK" }]
      );
      return;
    }
    if (!isAvailable) {
      Alert.alert(
        "Not Available",
        "Speech recognition is not supported in this browser."
      );
      return;
    }
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const processOCRImage = async (image: OCRImageInput) => {
    setOcrLoading(true);
    setError("");

    try {
      const ssccs = await extractSSCCsOnDevice(image);

      setOcrLoading(false);

      if (ssccs.length === 0) {
        Alert.alert(
          "No SSCCs Found",
          "No SSCC numbers were detected. Try a clearer photo with visible numbers."
        );
      } else if (ssccs.length === 1) {
        generateBarcodeFromSSCC(ssccs[0]);
      } else {
        setOcrResults(ssccs);
        setOcrModalVisible(true);
      }

      Haptics.notificationAsync(
        ssccs.length > 0
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
    } catch {
      setOcrLoading(false);
      setError("On-device OCR failed. Try a clearer image or type manually.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const requestImagePermission = async (source: OCRImageSource) => {
    if (Platform.OS === "web") return true;

    if (source === "camera") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Camera Permission",
          "Camera access is needed to scan SSCC labels."
        );
        return false;
      }
      return true;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Photo Library Permission",
        "Photo library access is needed to choose label images."
      );
      return false;
    }
    return true;
  };

  const openImageForOCR = async (source: OCRImageSource) => {
    if (ocrLoading) return;
    if (manualOnlyMode) {
      Alert.alert(
        "Manual-Only Mode",
        "OCR is disabled. Turn off Manual-Only Mode to scan images."
      );
      return;
    }

    try {
      const hasPermission = await requestImagePermission(source);
      if (!hasPermission) return;

      const result =
        source === "camera" && Platform.OS !== "web"
          ? await ImagePicker.launchCameraAsync({
              quality: 0.8,
              base64: true,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              base64: true,
            });

      if (result.canceled) return;

      const imageAsset = result.assets?.[0];
      if (!imageAsset?.uri && !imageAsset?.base64) {
        setError("Could not read that image. Please try another one.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      await processOCRImage({
        uri: imageAsset?.uri,
        base64: imageAsset?.base64 ?? undefined,
      });
    } catch {
      setOcrLoading(false);
      setError(
        source === "camera"
          ? "Camera not available. Use the gallery button instead."
          : "Failed to open gallery. Please try again."
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleOpenCamera = async () => {
    await openImageForOCR("camera");
  };

  const handleOpenGallery = async () => {
    await openImageForOCR("gallery");
  };

  const handleOCRSelect = (sscc: string) => {
    setOcrModalVisible(false);
    generateBarcodeFromSSCC(sscc);
  };

  const generateAllOCR = () => {
    setOcrModalVisible(false);
    for (const sscc of ocrResults) {
      generateBarcodeFromSSCC(sscc);
    }
  };

  const barcodeWidth = Math.min(SCREEN_WIDTH - 48, 360);
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
      <StatusBar style="light" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + webBottomInset + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEnabled={history.length > 0}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <MaterialCommunityIcons
                  name="barcode-scan"
                  size={28}
                  color={palette.teal}
                />
                <Text style={styles.title}>SSCC Barcode</Text>
              </View>

              <View style={styles.inputSection}>
                <View style={styles.inputMethodRow}>
                  <Animated.View style={micAnimStyle}>
                    <Pressable
                      style={[
                        styles.micButton,
                        isListening && styles.micButtonActive,
                        manualOnlyMode && styles.inputMethodButtonDisabled,
                      ]}
                      onPress={handleMicPress}
                      disabled={manualOnlyMode}
                    >
                      <Ionicons
                        name={isListening ? "mic" : "mic-outline"}
                        size={28}
                        color={isListening ? palette.navy : palette.teal}
                      />
                    </Pressable>
                  </Animated.View>

                  <Pressable
                    style={[
                      styles.cameraButton,
                      manualOnlyMode && styles.inputMethodButtonDisabled,
                    ]}
                    onPress={handleOpenCamera}
                    disabled={ocrLoading || manualOnlyMode}
                  >
                    {ocrLoading ? (
                      <ActivityIndicator size="small" color={palette.teal} />
                    ) : (
                      <Ionicons
                        name="camera-outline"
                        size={28}
                        color={palette.teal}
                      />
                    )}
                  </Pressable>

                  <Pressable
                    style={[
                      styles.cameraButton,
                      manualOnlyMode && styles.inputMethodButtonDisabled,
                    ]}
                    onPress={handleOpenGallery}
                    disabled={ocrLoading || manualOnlyMode}
                  >
                    {ocrLoading ? (
                      <ActivityIndicator size="small" color={palette.teal} />
                    ) : (
                      <Ionicons
                        name="image-outline"
                        size={28}
                        color={palette.teal}
                      />
                    )}
                  </Pressable>
                </View>

                <View style={styles.modeToggleRow}>
                  <Text style={styles.modeToggleText}>
                    Manual-Only Mode (Offline)
                  </Text>
                  <Switch
                    value={manualOnlyMode}
                    onValueChange={toggleManualOnlyMode}
                    trackColor={{
                      false: palette.border,
                      true: palette.teal,
                    }}
                    thumbColor={manualOnlyMode ? palette.navy : palette.white}
                    ios_backgroundColor={palette.border}
                  />
                </View>

                <Text style={styles.inputLabel}>
                  {manualOnlyMode
                    ? "Manual-Only Mode is on. Type SSCC digits directly."
                    : isListening
                      ? "Listening... speak the digits"
                    : ocrLoading
                      ? "Analyzing image..."
                      : "Voice  /  Camera  /  Gallery  /  Type"}
                </Text>

                <View style={styles.inputRow}>
                  <View style={styles.prefixBadge}>
                    <Text style={styles.prefixText}>{SSCC_PREFIX}</Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={input}
                    onChangeText={(text) => {
                      setInput(text.replace(/\D/g, ""));
                      setError("");
                    }}
                    placeholder="17 or 18 digit SSCC"
                    placeholderTextColor={palette.textTertiary}
                    keyboardType="number-pad"
                    maxLength={18}
                    returnKeyType="done"
                    onSubmitEditing={generateBarcode}
                  />
                  {input.length > 0 && (
                    <Pressable
                      onPress={() => {
                        setInput("");
                        setError("");
                      }}
                      hitSlop={8}
                      style={styles.clearButton}
                    >
                      <Feather
                        name="x-circle"
                        size={18}
                        color={palette.textTertiary}
                      />
                    </Pressable>
                  )}
                </View>

                <View style={styles.digitCount}>
                  <Text
                    style={[
                      styles.digitCountText,
                      input.length >= 17 && input.length <= 18
                        ? { color: palette.teal }
                        : {},
                    ]}
                  >
                    {input.length}/18 digits
                  </Text>
                </View>

                {!!error && (
                  <View style={styles.errorContainer}>
                    <Feather
                      name="alert-circle"
                      size={14}
                      color={palette.red}
                    />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <Pressable
                  style={({ pressed }) => [
                    styles.generateButton,
                    pressed && styles.generateButtonPressed,
                    input.length < 17 && styles.generateButtonDisabled,
                  ]}
                  onPress={generateBarcode}
                  disabled={input.length < 17}
                >
                  <MaterialCommunityIcons
                    name="barcode"
                    size={20}
                    color={palette.navy}
                  />
                  <Text style={styles.generateButtonText}>
                    Generate Barcode
                  </Text>
                </Pressable>
              </View>

              {barcode && (
                <Animated.View
                  style={[styles.barcodeSection, barcodeAnimStyle]}
                >
                  <View style={styles.barcodeCard}>
                    <View style={styles.barcodeContainer}>
                      <BarcodeView
                        data={barcode}
                        width={barcodeWidth}
                        height={90}
                      />
                    </View>
                    <Text style={styles.humanReadable}>
                      {barcode.humanReadable}
                    </Text>

                    <View style={styles.barcodeActions}>
                      <Pressable
                        style={styles.actionButton}
                        onPress={copyToClipboard}
                      >
                        <Feather
                          name={copied ? "check" : "copy"}
                          size={16}
                          color={
                            copied ? palette.teal : palette.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.actionText,
                            copied && { color: palette.teal },
                          ]}
                        >
                          {copied ? "Copied" : "Copy"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                </Animated.View>
              )}

              {history.length > 0 && (
                <View style={styles.historyHeader}>
                  <Text style={styles.sectionTitle}>Recent</Text>
                  <Pressable
                    onPress={() => {
                      setHistory([]);
                      saveHistory([]);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                  >
                    <Text style={styles.clearAllText}>Clear All</Text>
                  </Pressable>
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <HistoryRow
              item={item}
              onSelect={selectFromHistory}
              onDelete={deleteFromHistory}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="barcode-off"
                size={40}
                color={palette.textTertiary}
              />
              <Text style={styles.emptyText}>No barcodes yet</Text>
              <Text style={styles.emptySubtext}>
                Enter an SSCC number to create your first barcode
              </Text>
            </View>
          }
        />
      </KeyboardAvoidingView>

      <Modal
        visible={ocrModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setOcrModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {ocrResults.length} SSCCs Found
              </Text>
              <Pressable
                onPress={() => setOcrModalVisible(false)}
                hitSlop={12}
              >
                <Feather name="x" size={24} color={palette.white} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
            >
              {ocrResults.map((sscc, idx) => (
                <OCRResultItem
                  key={idx}
                  sscc={sscc}
                  onGenerate={handleOCRSelect}
                />
              ))}
            </ScrollView>

            <Pressable
              style={({ pressed }) => [
                styles.generateAllButton,
                pressed && styles.generateButtonPressed,
              ]}
              onPress={generateAllOCR}
            >
              <MaterialCommunityIcons
                name="barcode"
                size={20}
                color={palette.navy}
              />
              <Text style={styles.generateButtonText}>Generate All</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {ocrLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={palette.teal} />
            <Text style={styles.loadingText}>Running on-device OCR...</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.navy,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    paddingBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: palette.white,
  },
  inputSection: {
    alignItems: "center",
    gap: 16,
  },
  inputMethodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  inputMethodButtonDisabled: {
    opacity: 0.35,
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.tealGlow,
    borderWidth: 2,
    borderColor: palette.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  micButtonActive: {
    backgroundColor: palette.teal,
    borderColor: palette.teal,
  },
  cameraButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: palette.tealGlow,
    borderWidth: 2,
    borderColor: palette.teal,
    alignItems: "center",
    justifyContent: "center",
  },
  modeToggleRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  modeToggleText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: palette.textSecondary,
  },
  inputLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: palette.textSecondary,
    textAlign: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    width: "100%",
    overflow: "hidden",
  },
  prefixBadge: {
    backgroundColor: palette.cardBg,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRightWidth: 1,
    borderRightColor: palette.border,
  },
  prefixText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: palette.teal,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: palette.white,
    paddingHorizontal: 12,
    paddingVertical: 14,
    letterSpacing: 1.5,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  digitCount: {
    alignSelf: "flex-end",
    marginTop: -8,
  },
  digitCountText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: palette.textTertiary,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255, 77, 106, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    width: "100%",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: palette.red,
    flex: 1,
  },
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.teal,
    paddingVertical: 14,
    borderRadius: 12,
    width: "100%",
  },
  generateButtonPressed: {
    opacity: 0.85,
  },
  generateButtonDisabled: {
    opacity: 0.4,
  },
  generateButtonText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: palette.navy,
  },
  barcodeSection: {
    marginTop: 24,
    width: "100%",
  },
  barcodeCard: {
    backgroundColor: palette.cardBg,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  barcodeContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  humanReadable: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: palette.white,
    marginTop: 14,
    letterSpacing: 1.2,
  },
  barcodeActions: {
    flexDirection: "row",
    marginTop: 14,
    gap: 16,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: palette.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  actionText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: palette.textSecondary,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 32,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: palette.white,
  },
  clearAllText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: palette.tealDim,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.cardBg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: palette.border,
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  historyTextContainer: {
    flex: 1,
  },
  historySSCC: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: palette.white,
    letterSpacing: 0.5,
  },
  historyDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: palette.textTertiary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 40,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: palette.textSecondary,
    marginTop: 4,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: palette.textTertiary,
    textAlign: "center",
    maxWidth: 240,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: palette.darkSlate,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    padding: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: palette.white,
  },
  modalScroll: {
    maxHeight: 300,
  },
  modalScrollContent: {
    gap: 8,
  },
  ocrResultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.cardBg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  ocrResultLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  ocrResultSSCC: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: palette.white,
    letterSpacing: 0.5,
  },
  ocrResultSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: palette.textTertiary,
    marginTop: 2,
  },
  generateAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: palette.teal,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11, 20, 38, 0.85)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingCard: {
    backgroundColor: palette.cardBg,
    borderRadius: 16,
    padding: 32,
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: palette.textSecondary,
  },
});
