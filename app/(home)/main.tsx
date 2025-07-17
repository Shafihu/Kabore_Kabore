/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use client";

import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
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

interface StoredExamResult {
  id: string;
  timestamp: number;
  studentName?: string;
  examTitle?: string;
  score: number;
  correct: number;
  total: number;
  percentage: number;
  grade: string;
  grading: boolean[];
  image: string;
}

interface AnalysisData {
  totalExams: number;
  averageScore: number;
  passRate: number;
  gradeDistribution: {
    A: number;
    B: number;
    C: number;
    D: number;
    E: number;
    F: number;
  };
  recentExams: StoredExamResult[];
}

interface ImageAsset {
  uri: string;
  width?: number;
  height?: number;
}

const { width, height } = Dimensions.get("window");

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [questions, setQuestions] = useState<any>("");
  const [answers, setAnswers] = useState("");
  const [viewImage, setViewImage] = useState(false);
  const [viewSelectedImage, setViewSelectedImage] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showDetailedResults, setShowDetailedResults] = useState(false);
  const [showManualUpload, setShowManualUpload] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [showGuide, setShowGuide] = useState(true);
  const [showSetup, setShowSetup] = useState(true);
  const [scanMode, setScanMode] = useState<"camera" | "upload">("camera");
  const [storedResults, setStoredResults] = useState<StoredExamResult[]>([]);
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Function to enforce 4:3 aspect ratio
  const enforceAspectRatio = async (imageUri: string): Promise<string> => {
    try {
      const imageInfo = await ImageManipulator.manipulateAsync(imageUri, [], {
        format: ImageManipulator.SaveFormat.JPEG,
      });

      const { width: imgWidth, height: imgHeight } = imageInfo;
      const targetRatio = 4 / 3;
      const currentRatio = imgWidth / imgHeight;

      let cropWidth = imgWidth;
      let cropHeight = imgHeight;
      let originX = 0;
      let originY = 0;

      if (currentRatio > targetRatio) {
        cropWidth = imgHeight * targetRatio;
        originX = (imgWidth - cropWidth) / 2;
      } else if (currentRatio < targetRatio) {
        cropHeight = imgWidth / targetRatio;
        originY = (imgHeight - cropHeight) / 2;
      }

      const manipulatedImage = await ImageManipulator.manipulateAsync(
        imageUri,
        [
          {
            crop: {
              originX,
              originY,
              width: cropWidth,
              height: cropHeight,
            },
          },
          {
            resize: {
              width: 800,
              height: 600,
            },
          },
        ],
        {
          compress: 0.9,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      return manipulatedImage.uri;
    } catch (error) {
      console.error("Error enforcing aspect ratio:", error);
      return imageUri;
    }
  };

  // Pulse animation for guide
  React.useEffect(() => {
    const pulse = () => {
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]).start(() => pulse());
    };
    pulse();
  }, []);

  const startScanning = (mode: "camera" | "upload") => {
    if (!questions || questions < 1 || questions > 60) {
      Alert.alert("Error", "Please enter valid number of questions (1-60)");
      return;
    }

    if (!answers || answers.length !== Number.parseInt(questions)) {
      Alert.alert(
        "Error",
        `Please provide exactly ${questions} answers (A-E).`
      );
      return;
    }

    setScanMode(mode);
    setShowSetup(false);

    if (mode === "camera") {
      openCamera();
    } else {
      // Directly open gallery for upload mode
      pickImageFromGallery();
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
    setShowGuide(true);
  };

  const pickImageFromGallery = async () => {
    setResult(null);
    setImage(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets?.[0]) {
        setShowManualUpload(true); // Show upload screen with loading
        setLoading(true);
        const processedImageUri = await enforceAspectRatio(
          result.assets[0].uri
        );
        await processImage(processedImageUri);
      } else {
        // User cancelled, go back to setup
        setShowManualUpload(false);
        setShowSetup(true);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image from gallery");
      setShowManualUpload(false);
      setShowSetup(true);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        setLoading(true);
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1,
          base64: false,
          skipProcessing: true,
          exif: false,
        });

        const processedImageUri = await enforceAspectRatio(photo.uri);
        await processImage(processedImageUri);
      } catch (error) {
        Alert.alert("Error", "Failed to take picture");
        setLoading(false);
      }
    }
  };

  const processImage = async (imageUri: string) => {
    const convertedAnswers = answers
      .toUpperCase()
      .split("")
      .map((ans) => {
        if (ans >= "A" && ans <= "E") return ans.charCodeAt(0) - 65;
        return null;
      })
      .filter((ans) => ans !== null);

    const formData = new FormData();
    formData.append("image", {
      uri: imageUri,
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
      setImage(imageUri);
    } catch (error: any) {
      Alert.alert("Error", error.response?.data?.error || "Processing failed");
    } finally {
      setLoading(false);
    }
  };

  const scanAgain = () => {
    setResult(null);
    setImage(null);
    setLoading(false);
  };

  const goBackToSetup = () => {
    setShowCamera(false);
    setShowManualUpload(false);
    setShowSetup(true);
    setResult(null);
    setImage(null);
  };

  // Storage and Analysis Functions
  const calculateGrade = (percentage: number): string => {
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B";
    if (percentage >= 60) return "C";
    if (percentage >= 50) return "D";
    if (percentage >= 40) return "E";
    return "F";
  };

  const saveResult = async (examResult: ExamResult) => {
    try {
      const percentage = (examResult.score / examResult.total) * 100;
      const grade = calculateGrade(percentage);

      const storedResult: StoredExamResult = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        score: examResult.score,
        correct: examResult.correct,
        total: examResult.total,
        percentage,
        grade,
        grading: examResult.grading,
        image: examResult.image,
      };

      const existingResults = await AsyncStorage.getItem("examResults");
      const results: StoredExamResult[] = existingResults
        ? JSON.parse(existingResults)
        : [];

      results.push(storedResult);
      await AsyncStorage.setItem("examResults", JSON.stringify(results));

      setStoredResults(results);
    } catch (error) {
      console.error("Error saving result:", error);
    }
  };

  const loadStoredResults = async () => {
    try {
      const existingResults = await AsyncStorage.getItem("examResults");
      if (existingResults) {
        const results: StoredExamResult[] = JSON.parse(existingResults);
        setStoredResults(results);
      }
    } catch (error) {
      console.error("Error loading results:", error);
    }
  };

  const generateAnalysis = (): AnalysisData => {
    if (storedResults.length === 0) {
      return {
        totalExams: 0,
        averageScore: 0,
        passRate: 0,
        gradeDistribution: {
          A: 0,
          B: 0,
          C: 0,
          D: 0,
          E: 0,
          F: 0,
        },
        recentExams: [],
      };
    }

    const totalExams = storedResults.length;
    const averageScore =
      storedResults.reduce((sum, result) => sum + result.percentage, 0) /
      totalExams;
    const passRate =
      (storedResults.filter((result) => result.percentage >= 40).length /
        totalExams) *
      100;

    const gradeDistribution = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      F: 0,
    };

    storedResults.forEach((result) => {
      gradeDistribution[result.grade as keyof typeof gradeDistribution]++;
    });

    const recentExams = storedResults
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    return {
      totalExams,
      averageScore,
      passRate,
      gradeDistribution,
      recentExams,
    };
  };

  const showAnalysisModal = () => {
    const analysis = generateAnalysis();
    setAnalysisData(analysis);
    setShowAnalysis(true);
  };

  const clearAllResults = async () => {
    Alert.alert(
      "Clear All Results",
      "Are you sure you want to delete all stored exam results? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem("examResults");
              setStoredResults([]);
              setAnalysisData(null);
              Alert.alert("Success", "All results have been cleared.");
            } catch (error) {
              Alert.alert("Error", "Failed to clear results.");
            }
          },
        },
      ]
    );
  };

  // Load stored results on component mount
  useEffect(() => {
    loadStoredResults();
  }, []);

  // Save result when new result is available
  useEffect(() => {
    if (result) {
      saveResult(result);
    }
  }, [result]);

  const renderCameraGuide = () => {
    return (
      <View style={styles.guideContainer}>
        <Animated.View
          style={[
            styles.instructionContainer,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <View style={styles.instructionBox}>
            <Text style={styles.instructionTitle}>
              📋 Position Answer Sheet
            </Text>
            <Text style={styles.instructionText}>
              • Align within the 4:3 frame{"\n"}• Ensure good lighting{"\n"}•
              Keep sheet flat and visible
            </Text>
          </View>
        </Animated.View>

        <TouchableOpacity
          style={styles.toggleGuideButton}
          onPress={() => setShowGuide(!showGuide)}
        >
          <Text style={styles.toggleGuideText}>
            {showGuide ? "Hide Guide" : "Show Guide"}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderBriefResults = () => {
    if (!result) return null;

    const percentage = (result.score / result.total) * 100;
    const grade = calculateGrade(percentage);

    return (
      <View style={styles.briefResultsOverlay}>
        <View style={styles.briefResultsContainer}>
          <View style={styles.briefScoreSection}>
            <View style={styles.briefScoreBox}>
              <Text style={styles.briefScoreText}>{result.score}</Text>
              <Text style={styles.briefScoreLabel}>Score</Text>
            </View>
            <View style={styles.briefStatsContainer}>
              <Text style={styles.briefStatsText}>
                {result.correct} of {result.total} correct
              </Text>
              <Text style={styles.briefPercentageText}>
                {percentage.toFixed(1)}% • {grade}
              </Text>
            </View>
            <Image
              source={{ uri: result.image }}
              style={{ width: 100, height: 100 }}
              resizeMode="contain"
            />
          </View>

          <View style={styles.briefButtonsContainer}>
            <TouchableOpacity
              style={styles.scanAgainButton}
              onPress={scanAgain}
            >
              <LinearGradient
                colors={["#4299e1", "#3182ce"]}
                style={styles.briefButtonGradient}
              >
                <Text style={styles.briefButtonText}>Scan Again</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.advancedButton}
              onPress={() => setShowDetailedResults(true)}
            >
              <LinearGradient
                colors={["#48bb78", "#38a169"]}
                style={styles.briefButtonGradient}
              >
                <Text style={styles.briefButtonText}>View Details</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderDetailedResults = () => {
    if (!result) return null;

    return (
      <Modal visible={showDetailedResults} animationType="slide">
        <View style={styles.detailedResultsContainer}>
          <LinearGradient
            colors={["#1a365d", "#2d5a87", "#4299e1"]}
            style={styles.detailedGradient}
          >
            <View style={styles.detailedHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setShowDetailedResults(false)}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.detailedTitle}>Detailed Results</Text>
              <View style={styles.placeholder} />
            </View>

            <ScrollView style={styles.detailedScrollView}>
              <View style={styles.detailedScoreContainer}>
                <LinearGradient
                  colors={["#4299e1", "#3182ce"]}
                  style={styles.detailedScoreBox}
                >
                  <Text style={styles.detailedScoreText}>{result.score}</Text>
                  <Text style={styles.detailedScoreLabel}>Final Score</Text>
                </LinearGradient>

                <View style={styles.detailedProgressContainer}>
                  <Text style={styles.detailedProgressText}>
                    {result.correct || 0}/{result.total || 0} Correct Answers
                  </Text>
                  <View style={styles.detailedProgressBar}>
                    <LinearGradient
                      colors={["#48bb78", "#38a169"]}
                      style={[
                        styles.detailedProgressFill,
                        {
                          width: `${
                            result.total
                              ? (result.correct / result.total) * 100
                              : 0
                          }%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>

              {result.image && (
                <View style={styles.detailedImageSection}>
                  <Text style={styles.detailedSectionTitle}>
                    Processed Answer Sheet
                  </Text>
                  <TouchableOpacity
                    onPress={() => setViewImage(true)}
                    style={styles.detailedImageCard}
                  >
                    <Image
                      source={{ uri: result.image }}
                      style={styles.detailedProcessedImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.detailedTableSection}>
                <Text style={styles.detailedSectionTitle}>
                  Question by Question
                </Text>
                <View style={styles.tableContainer}>
                  <View style={styles.tableHeader}>
                    <Text
                      style={[styles.tableHeaderText, styles.questionColumn]}
                    >
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

                  {result.grading &&
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
                          <Text
                            style={[
                              styles.tableCellText,
                              styles.questionColumn,
                            ]}
                          >
                            {index + 1}
                          </Text>
                          <Text
                            style={[styles.tableCellText, styles.answerColumn]}
                          >
                            {correctAnswer}
                          </Text>
                          <Text
                            style={[styles.tableCellText, styles.answerColumn]}
                          >
                            {studentAnswer}
                          </Text>
                          <View
                            style={[styles.statusColumn, styles.statusCell]}
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
            </ScrollView>
          </LinearGradient>
        </View>

        {result && (
          <ImageView
            images={[{ uri: result.image }]}
            imageIndex={0}
            visible={viewImage}
            onRequestClose={() => setViewImage(false)}
          />
        )}
      </Modal>
    );
  };

  const renderAnalysisModal = () => {
    if (!analysisData) return null;

    return (
      <Modal visible={showAnalysis} animationType="slide">
        <View style={styles.analysisContainer}>
          <LinearGradient
            colors={["#1a365d", "#2d5a87", "#4299e1"]}
            style={styles.analysisGradient}
          >
            {/* Header */}
            <View style={styles.analysisHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowAnalysis(false)}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.analysisTitle}>Exam Analysis</Text>
              <TouchableOpacity
                style={styles.clearButton}
                onPress={clearAllResults}
              >
                <Text style={styles.clearButtonText}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.analysisScrollView}
              showsVerticalScrollIndicator={false}
            >
              {/* Overview Stats */}
              <View style={styles.overviewSection}>
                <Text style={styles.sectionTitle}>📊 Overview</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {analysisData.totalExams}
                    </Text>
                    <Text style={styles.statLabel}>Total Exams</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {analysisData.averageScore.toFixed(1)}%
                    </Text>
                    <Text style={styles.statLabel}>Average Score</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statNumber}>
                      {analysisData.passRate.toFixed(1)}%
                    </Text>
                    <Text style={styles.statLabel}>Pass Rate</Text>
                  </View>
                </View>
              </View>

              {/* Grade Distribution */}
              <View style={styles.gradeSection}>
                <Text style={styles.sectionTitle}>📈 Grade Distribution</Text>
                <View style={styles.gradeContainer}>
                  {Object.entries(analysisData.gradeDistribution).map(
                    ([grade, count]) => (
                      <View key={grade} style={styles.gradeItem}>
                        <View style={styles.gradeBar}>
                          <View
                            style={[
                              styles.gradeBarFill,
                              {
                                width: `${
                                  analysisData.totalExams > 0
                                    ? (count / analysisData.totalExams) * 100
                                    : 0
                                }%`,
                                backgroundColor: getGradeColor(grade),
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.gradeInfo}>
                          <Text style={styles.gradeText}>{grade}</Text>
                          <Text style={styles.gradeCount}>{count}</Text>
                        </View>
                      </View>
                    )
                  )}
                </View>
              </View>

              {/* Recent Exams */}
              <View style={styles.recentSection}>
                <Text style={styles.sectionTitle}>🕒 Recent Exams</Text>
                {analysisData.recentExams.length > 0 ? (
                  <View style={styles.recentExamsContainer}>
                    {analysisData.recentExams.map((exam, index) => (
                      <View key={exam.id} style={styles.recentExamCard}>
                        <View style={styles.recentExamHeader}>
                          <Text style={styles.recentExamNumber}>
                            #{analysisData.totalExams - index}
                          </Text>
                          <Text style={styles.recentExamDate}>
                            {new Date(exam.timestamp).toLocaleDateString()}
                          </Text>
                        </View>
                        <View style={styles.recentExamStats}>
                          <View style={styles.recentExamStat}>
                            <Text style={styles.recentExamScore}>
                              {exam.score}/{exam.total}
                            </Text>
                            <Text style={styles.recentExamLabel}>Score</Text>
                          </View>
                          <View style={styles.recentExamStat}>
                            <Text style={styles.recentExamPercentage}>
                              {exam.percentage.toFixed(1)}%
                            </Text>
                            <Text style={styles.recentExamLabel}>
                              Percentage
                            </Text>
                          </View>
                          <View style={styles.recentExamStat}>
                            <Text
                              style={[
                                styles.recentExamGrade,
                                { color: getGradeColor(exam.grade) },
                              ]}
                            >
                              {exam.grade}
                            </Text>
                            <Text style={styles.recentExamLabel}>Grade</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>
                      No exams analyzed yet
                    </Text>
                    <Text style={styles.emptyStateSubtext}>
                      Scan some answer sheets to see analysis
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </LinearGradient>
        </View>
      </Modal>
    );
  };

  const getGradeColor = (grade: string): string => {
    switch (grade) {
      case "A":
        return "#48bb78";
      case "B":
        return "#9ae6b4";
      case "C":
        return "#ed8936";
      case "D":
        return "#f6e05e";
      case "E":
        return "#f6ad55";
      case "F":
        return "#c53030";
      default:
        return "#718096";
    }
  };

  const renderCamera = () => {
    return (
      <Modal visible={showCamera} animationType="slide">
        <View style={styles.cameraContainer}>
          {/* Top header bar */}
          <View style={styles.cameraHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={goBackToSetup}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.cameraTitleContainer}>
              <Text style={styles.cameraTitle}>Camera Scanner</Text>
            </View>
            <View style={styles.placeholder} />
          </View>

          {/* Camera View Container - Full width and height */}
          <View style={styles.cameraViewContainerFixed}>
            <CameraView
              ref={cameraRef}
              style={styles.centeredCameraFixed}
              facing="back"
              ratio="4:3"
              pictureSize="high"
            />
            {/* Overlays positioned absolutely on top of camera */}
            {showGuide && !result && renderCameraGuide()}
            {result && renderBriefResults()}
          </View>

          {/* Bottom footer bar */}
          <View style={styles.cameraFooter}>
            <View style={styles.captureButtonContainer}>
              {!result && (
                <TouchableOpacity
                  style={[
                    styles.captureButton,
                    loading && styles.captureButtonDisabled,
                  ]}
                  onPress={takePicture}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="large" />
                  ) : (
                    <LinearGradient
                      colors={["#ffffff", "#f7fafc"]}
                      style={styles.captureButtonInner}
                    />
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
        {/* Detailed Results Modal - Outside camera modal */}
        {renderDetailedResults()}
      </Modal>
    );
  };

  const renderManualUpload = () => {
    return (
      <Modal visible={showManualUpload} animationType="slide">
        <View style={styles.uploadContainer}>
          <LinearGradient
            colors={["#1a365d", "#2d5a87", "#4299e1"]}
            style={styles.uploadGradient}
          >
            <View style={styles.uploadHeader}>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={goBackToSetup}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
              <View style={styles.uploadTitleContainer}>
                <Text style={styles.uploadTitle}>Processing Upload</Text>
              </View>
              <View style={styles.placeholder} />
            </View>

            <View style={styles.uploadContent}>
              {loading && !result && (
                <View style={styles.uploadLoadingContainer}>
                  <ActivityIndicator color="#fff" size="large" />
                  <Text style={styles.uploadLoadingText}>
                    Processing image...
                  </Text>
                </View>
              )}

              {result && renderBriefResults()}
            </View>
          </LinearGradient>
        </View>

        {/* Detailed Results Modal */}
        {renderDetailedResults()}
      </Modal>
    );
  };

  const renderSetup = () => {
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
              <View style={styles.header}>
                <Text style={styles.title}>MCQ Scanner Setup</Text>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.sectionTitle}>📝 Exam Configuration</Text>

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

                <View style={styles.scanModeSection}>
                  <Text style={styles.sectionTitle}>
                    📷 Choose Scanning Mode
                  </Text>

                  <View style={styles.modeButtonsContainer}>
                    <TouchableOpacity
                      style={styles.modeButton}
                      onPress={() => startScanning("camera")}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={["#4299e1", "#3182ce"]}
                        style={styles.modeButtonGradient}
                      >
                        <Text style={styles.modeButtonIcon}>📷</Text>
                        <Text style={styles.modeButtonTitle}>Camera Mode</Text>
                        <Text style={styles.modeButtonText}>
                          Use live camera to scan answer sheets
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modeButton}
                      onPress={() => startScanning("upload")}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={["#48bb78", "#38a169"]}
                        style={styles.modeButtonGradient}
                      >
                        <Text style={styles.modeButtonIcon}>📁</Text>
                        <Text style={styles.modeButtonTitle}>Upload Mode</Text>
                        <Text style={styles.modeButtonText}>
                          Select existing images from gallery
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Analysis Section */}
                <View style={styles.analysisSection}>
                  <Text style={styles.sectionTitle}>
                    📊 Analysis & Insights
                  </Text>

                  <TouchableOpacity
                    style={styles.analysisButton}
                    onPress={showAnalysisModal}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={["#ed8936", "#dd6b20"]}
                      style={styles.analysisButtonGradient}
                    >
                      <Text style={styles.analysisButtonIcon}>📈</Text>
                      <Text style={styles.analysisButtonTitle}>
                        View Analysis
                      </Text>
                      <Text style={styles.analysisButtonText}>
                        {storedResults.length > 0
                          ? `${storedResults.length} exam${
                              storedResults.length > 1 ? "s" : ""
                            } analyzed`
                          : "No exams analyzed yet"}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </LinearGradient>
      </View>
    );
  };

  return (
    <>
      {showSetup && renderSetup()}
      {renderCamera()}
      {renderManualUpload()}
      {renderAnalysisModal()}
    </>
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
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
    flex: 1,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
    marginBottom: 16,
    textAlign: "center",
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
  // Scan Mode Selection
  scanModeSection: {
    marginTop: 20,
  },
  modeButtonsContainer: {
    gap: 16,
  },
  modeButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  modeButtonGradient: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  modeButtonIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  modeButtonTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  modeButtonText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  // Analysis Section
  analysisSection: {
    marginTop: 20,
  },
  analysisButton: {
    borderRadius: 16,
    overflow: "hidden",
  },
  analysisButtonGradient: {
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  analysisButtonIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  analysisButtonTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 8,
  },
  analysisButtonText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  // Camera styles
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  darkBar: {
    backgroundColor: "#000000",
    flex: 1,
    justifyContent: "center",
  },
  cameraViewContainer: {
    aspectRatio: 4 / 3,
    width: "100%",
    backgroundColor: "#000000",
    position: "relative",
  },
  cameraViewContainerFixed: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000000",
    position: "relative",
  },
  centeredCamera: {
    flex: 1,
    width: "100%",
  },
  centeredCameraFixed: {
    flex: 1,
    width: "100%",
  },
  cameraHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginTop: 20,
  },
  cameraFooter: {
    paddingVertical: 40,
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
  captureButtonDisabled: {
    opacity: 0.6,
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  // Manual Upload styles
  uploadContainer: {
    flex: 1,
  },
  uploadGradient: {
    flex: 1,
    paddingTop: 40,
  },
  uploadHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  uploadTitleContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  uploadTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  uploadContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  uploadLoadingContainer: {
    alignItems: "center",
  },
  uploadLoadingText: {
    color: "white",
    fontSize: 18,
    marginTop: 16,
    fontWeight: "600",
  },
  // Brief Results Overlay
  briefResultsOverlay: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    zIndex: 1000,
  },
  briefResultsContainer: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  briefScoreSection: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  briefScoreBox: {
    alignItems: "center",
    marginRight: 20,
  },
  briefScoreText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
  },
  briefScoreLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 4,
  },
  briefStatsContainer: {
    flex: 1,
  },
  briefStatsText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
    marginBottom: 4,
  },
  briefPercentageText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#48bb78",
  },
  briefButtonsContainer: {
    flexDirection: "row",
    gap: 12,
  },
  scanAgainButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  advancedButton: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  briefButtonGradient: {
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  briefButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  briefProcessedImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
  },
  // Camera Guide styles
  guideContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionContainer: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: "center",
  },
  instructionBox: {
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    maxWidth: 280,
  },
  instructionTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 8,
  },
  instructionText: {
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "left",
  },
  toggleGuideButton: {
    position: "absolute",
    top: 80,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  toggleGuideText: {
    color: "white",
    fontSize: 10,
    fontWeight: "600",
  },
  // Detailed Results Modal
  detailedResultsContainer: {
    flex: 1,
  },
  detailedGradient: {
    flex: 1,
    paddingTop: 40,
  },
  detailedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
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
  detailedTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
  },
  detailedScrollView: {
    flex: 1,
    padding: 20,
  },
  detailedScoreContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  detailedScoreBox: {
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    marginRight: 20,
    minWidth: 80,
  },
  detailedScoreText: {
    fontSize: 28,
    fontWeight: "bold",
    color: "white",
  },
  detailedScoreLabel: {
    fontSize: 12,
    color: "white",
    marginTop: 4,
  },
  detailedProgressContainer: {
    flex: 1,
  },
  detailedProgressText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "white",
  },
  detailedProgressBar: {
    height: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 6,
    overflow: "hidden",
  },
  detailedProgressFill: {
    height: "100%",
    borderRadius: 6,
  },
  detailedImageSection: {
    marginBottom: 24,
  },
  detailedSectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    marginBottom: 12,
  },
  detailedImageCard: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  detailedProcessedImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  detailedTableSection: {
    marginBottom: 24,
  },
  tableContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    overflow: "hidden",
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
  // Analysis Modal Styles
  analysisContainer: {
    flex: 1,
  },
  analysisGradient: {
    flex: 1,
    paddingTop: 40,
  },
  analysisHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
  },
  analysisTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "white",
  },
  clearButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  clearButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  analysisScrollView: {
    flex: 1,
    padding: 20,
  },
  overviewSection: {
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
  },
  statCard: {
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
  },
  gradeSection: {
    marginBottom: 24,
  },
  gradeContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 10,
  },
  gradeItem: {
    alignItems: "center",
    width: "30%", // Adjust for 3 columns
  },
  gradeBar: {
    width: "100%",
    height: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 8,
  },
  gradeBarFill: {
    height: "100%",
    borderRadius: 5,
  },
  gradeInfo: {
    alignItems: "center",
  },
  gradeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
  },
  gradeCount: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
  },
  recentSection: {
    marginBottom: 24,
  },
  recentExamsContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  recentExamCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  recentExamHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  recentExamNumber: {
    fontSize: 14,
    fontWeight: "bold",
    color: "white",
  },
  recentExamDate: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
  },
  recentExamStats: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  recentExamStat: {
    alignItems: "center",
  },
  recentExamScore: {
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
  },
  recentExamLabel: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.8)",
  },
  recentExamPercentage: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#48bb78",
  },
  recentExamGrade: {
    fontSize: 16,
    fontWeight: "bold",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyStateText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 14,
    textAlign: "center",
  },
});
