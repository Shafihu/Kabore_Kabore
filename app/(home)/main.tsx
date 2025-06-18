/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import axios from "axios";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import ImageView from "react-native-image-viewing";

interface ExamResult {
  score: number;
  correct: number;
  total: number;
  grading: boolean[];
  image: string;
  image_type: string;
}

interface ImageAsset {
  uri: string;
  width?: number;
  height?: number;
}

const { width } = Dimensions.get("window");

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [questions, setQuestions] = useState<any>("");
  const [answers, setAnswers] = useState("");
  const [viewImage, setViewImage] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]) {
      setImage(result.assets[0].uri);
      setResult(null);
    }
  };

  const takePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]) {
      setImage(result.assets[0].uri);
      setResult(null);
    }
  };

  const openCamera = async () => {
    if (!permission) {
      return;
    }

    if (!permission.granted) {
      const permissionResult = await requestPermission();
      if (!permissionResult.granted) {
        Alert.alert(
          "Permission required",
          "Camera permission is needed to take photos"
        );
        return;
      }
    }

    setShowCamera(true);
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,
          base64: false,
        });
        setImage(photo.uri);
        setResult(null);
        setShowCamera(false);
      } catch (error) {
        Alert.alert("Error", "Failed to take picture");
      }
    }
  };

  const uploadImage = async () => {
    if (!image) {
      Alert.alert("Error", "Please select an image first.");
      return;
    }

    if (!questions || questions < 1 || questions > 60) {
      Alert.alert("Error", "Please enter valid number of questions (1-60)");
      return;
    }

    const convertedAnswers = answers
      .toUpperCase()
      .split("")
      .map((ans) => {
        if (ans >= "A" && ans <= "E") return ans.charCodeAt(0) - 65;
        return null;
      })
      .filter((ans) => ans !== null);

    if (convertedAnswers.length !== Number.parseInt(questions)) {
      Alert.alert(
        "Error",
        `Please provide exactly ${questions} answers (A-E).`
      );
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("image", {
      uri: image,
      name: "exam_sheet.jpg",
      type: "image/jpeg",
    } as any);
    formData.append("questions", questions);
    formData.append("answers", JSON.stringify(convertedAnswers));

    try {
      const response = await axios.post(
        "http://172.20.10.4:3000/process-image",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        }
      );

      setResult(response.data);
    } catch (error: any) {
      Alert.alert("Error", error.response?.data?.error || "Processing failed");
    } finally {
      setLoading(false);
    }
  };

  const renderResult = () => {
    if (!result) return null;

    return (
      <View style={styles.resultContainer}>
        <Text style={styles.sectionTitle}>📊 Exam Results</Text>

        <View style={styles.scoreContainer}>
          <LinearGradient
            colors={["#4299e1", "#3182ce"]}
            style={styles.scoreBox}
          >
            <Text style={styles.scoreText}>{result.score}</Text>
            <Text style={styles.scoreLabel}>Score</Text>
          </LinearGradient>

          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              {result.correct || 0}/{result.total || 0} Correct Answers
            </Text>
            <View style={styles.progressBar}>
              <LinearGradient
                colors={["#48bb78", "#38a169"]}
                style={[
                  styles.progressFill,
                  {
                    width: `${
                      result.total ? (result.correct / result.total) * 100 : 0
                    }%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>🖼️ Processed Answer Sheet</Text>
        {result.image ? (
          <TouchableOpacity
            onPress={() => setViewImage(true)}
            style={styles.imageCard}
          >
            <Image
              source={{ uri: result.image }}
              style={styles.processedImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        ) : (
          <Text style={{ textAlign: "center", color: "tomato" }}>
            Oops! nothing found
          </Text>
        )}

        {result && (
          <ImageView
            images={[{ uri: result.image }]}
            imageIndex={0}
            visible={viewImage}
            onRequestClose={() => setViewImage(false)}
          />
        )}

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
          📋 Detailed Results
        </Text>
        <View style={styles.tableContainer}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, styles.questionColumn]}>
              Q#
            </Text>
            <Text style={[styles.tableHeaderText, styles.answerColumn]}>
              Correct
            </Text>
            <Text style={[styles.tableHeaderText, styles.answerColumn]}>
              Student
            </Text>
            <Text style={[styles.tableHeaderText, styles.statusColumn]}>
              Status
            </Text>
          </View>

          {result &&
            result.grading &&
            Array.isArray(result.grading) &&
            result.grading.map((isCorrect, index) => {
              const correctAnswers = answers.toUpperCase().split("");
              const correctAnswer = correctAnswers[index] || "-";
              const studentAnswer = isCorrect
                ? correctAnswer
                : correctAnswer === "A"
                ? "B"
                : "A";

              return (
                <View
                  key={index}
                  style={[
                    styles.tableRow,
                    index % 2 === 0 ? styles.evenRow : styles.oddRow,
                  ]}
                >
                  <Text style={[styles.tableCellText, styles.questionColumn]}>
                    {index + 1}
                  </Text>
                  <Text style={[styles.tableCellText, styles.answerColumn]}>
                    {correctAnswer}
                  </Text>
                  <Text style={[styles.tableCellText, styles.answerColumn]}>
                    {studentAnswer}
                  </Text>
                  <View
                    style={[
                      styles.tableCellText,
                      styles.statusColumn,
                      styles.statusCell,
                    ]}
                  >
                    <LinearGradient
                      colors={
                        isCorrect
                          ? ["#48bb78", "#38a169"]
                          : ["#f56565", "#e53e3e"]
                      }
                      style={styles.statusIndicator}
                    >
                      <Text style={styles.statusText}>
                        {isCorrect ? "✓" : "✗"}
                      </Text>
                    </LinearGradient>
                  </View>
                </View>
              );
            })}
        </View>
      </View>
    );
  };

  const renderCamera = () => {
    return (
      <Modal visible={showCamera} animationType="slide">
        <View style={styles.cameraContainer}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back">
            <LinearGradient
              colors={[
                "rgba(26, 54, 93, 0.3)",
                "rgba(45, 90, 135, 0.2)",
                "transparent",
              ]}
              style={styles.cameraOverlay}
            >
              <View style={styles.cameraHeader}>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowCamera(false)}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
                <View style={styles.cameraTitleContainer}>
                  <Text style={styles.cameraTitle}>
                    Take Photo of Answer Sheet
                  </Text>
                </View>
                <View style={styles.placeholder} />
              </View>

              <View style={styles.cameraFooter}>
                <View style={styles.captureButtonContainer}>
                  <TouchableOpacity
                    style={styles.captureButton}
                    onPress={takePicture}
                  >
                    <LinearGradient
                      colors={["#ffffff", "#f7fafc"]}
                      style={styles.captureButtonInner}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </CameraView>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1a365d" />
      <LinearGradient
        colors={["#1a365d", "#2d5a87", "#4299e1"]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView style={styles.keyboardView} behavior="padding">
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>MCQ Marker</Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionSection}>
              <Text style={styles.sectionTitle}>📷 Choose Input Method</Text>
              <View style={styles.buttonGroup}>
                <TouchableOpacity
                  style={styles.glassButton}
                  onPress={pickImage}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[
                      "rgba(255, 255, 255, 0.2)",
                      "rgba(255, 255, 255, 0.1)",
                    ]}
                    style={styles.buttonGradient}
                  >
                    <Text style={styles.buttonIcon}>📁</Text>
                    <Text style={styles.buttonText}>Gallery</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.glassButton}
                  onPress={openCamera}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[
                      "rgba(255, 255, 255, 0.2)",
                      "rgba(255, 255, 255, 0.1)",
                    ]}
                    style={styles.buttonGradient}
                  >
                    <Text style={styles.buttonIcon}>📷</Text>
                    <Text style={styles.buttonText}>Camera</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.glassButton}
                  onPress={takePhoto}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[
                      "rgba(255, 255, 255, 0.2)",
                      "rgba(255, 255, 255, 0.1)",
                    ]}
                    style={styles.buttonGradient}
                  >
                    <Text style={styles.buttonIcon}>📸</Text>
                    <Text style={styles.buttonText}>Quick</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>

            {/* Image Preview */}
            {image && (
              <View style={styles.imageSection}>
                <Text style={styles.sectionTitle}>🖼️ Selected Image</Text>
                <View style={styles.imageCard}>
                  <Image source={{ uri: image }} style={styles.previewImage} />
                </View>
              </View>
            )}

            {/* Input Form */}
            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>📝 Exam Details</Text>

              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>Number of Questions</Text>
                <TextInput
                  style={styles.glassInput}
                  placeholder="Enter 1-60"
                  placeholderTextColor="rgba(255, 255, 255, 0.6)"
                  keyboardType="number-pad"
                  value={questions}
                  onChangeText={setQuestions}
                />
              </View>

              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>Answer Key</Text>
                <TextInput
                  style={styles.glassInput}
                  placeholder="e.g., ABCDE"
                  placeholderTextColor="rgba(255, 255, 255, 0.6)"
                  value={answers}
                  onChangeText={setAnswers}
                />
              </View>

              <TouchableOpacity
                style={styles.processButton}
                onPress={uploadImage}
                disabled={loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={["#48bb78", "#38a169"]}
                  style={styles.processButtonGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.processButtonIcon}>🚀</Text>
                      <Text style={styles.processButtonText}>Process Exam</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {renderResult()}
            {renderCamera()}
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    paddingVertical: 20,
    paddingTop: 30,
  },
  keyboardView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    padding: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 30,
    paddingTop: 10,
  },
  backButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  backButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    flex: 1,
    textAlign: "center",
  },
  actionSection: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 16,
    textAlign: "center",
  },
  buttonGroup: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  glassButton: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  buttonGradient: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
  },
  buttonIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  buttonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  imageSection: {
    marginBottom: 30,
  },
  imageCard: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  previewImage: {
    width: width - 80,
    height: 200,
    borderRadius: 12,
  },
  formSection: {
    marginBottom: 30,
  },
  inputCard: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  inputLabel: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
  },
  glassInput: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    padding: 16,
    color: "white",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  processButton: {
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 10,
  },
  processButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  processButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  processButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  resultContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
    padding: 24,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  scoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  scoreBox: {
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    marginRight: 20,
    minWidth: 80,
  },
  scoreText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
  },
  scoreLabel: {
    fontSize: 12,
    color: "white",
    marginTop: 4,
  },
  progressContainer: {
    flex: 1,
  },
  progressText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "white",
  },
  progressBar: {
    height: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 6,
  },
  processedImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  tableContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    overflow: "hidden",
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  tableHeaderText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  evenRow: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  oddRow: {
    backgroundColor: "transparent",
  },
  tableCellText: {
    fontSize: 14,
    color: "white",
    textAlign: "center",
  },
  questionColumn: {
    flex: 1,
  },
  answerColumn: {
    flex: 1.5,
  },
  statusColumn: {
    flex: 1.5,
  },
  statusCell: {
    alignItems: "center",
    justifyContent: "center",
  },
  statusIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
  },
  // Camera styles
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
  },
  cameraHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  closeButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  cameraTitleContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  cameraTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  placeholder: {
    width: 44,
  },
  cameraFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 60,
  },
  captureButtonContainer: {
    alignItems: "center",
  },
  captureButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
});
