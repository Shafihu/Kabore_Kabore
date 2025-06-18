import cv2
import numpy as np
import sys
import json
import base64

def image_to_base64(img):
    """Convert OpenCV image to base64 string"""
    _, buffer = cv2.imencode('.jpg', img)
    return base64.b64encode(buffer).decode('utf-8')

def draw_corner_markers(img, corners, color=(0, 255, 255), size=20):
    """Draw corner markers at the specified points"""
    for i, corner in enumerate(corners):
        x, y = int(corner[0][0]), int(corner[0][1])
        
        # Draw different shapes for each corner for identification
        if i == 0:  # Top-left - Circle
            cv2.circle(img, (x, y), size, color, -1)
            cv2.circle(img, (x, y), size + 5, (255, 255, 255), 3)
            cv2.putText(img, "TL", (x - 15, y - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        elif i == 1:  # Top-right - Square
            cv2.rectangle(img, (x - size, y - size), (x + size, y + size), color, -1)
            cv2.rectangle(img, (x - size - 5, y - size - 5), (x + size + 5, y + size + 5), (255, 255, 255), 3)
            cv2.putText(img, "TR", (x - 15, y - 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        elif i == 2:  # Bottom-left - Triangle
            pts = np.array([[x, y - size], [x - size, y + size], [x + size, y + size]], np.int32)
            cv2.fillPoly(img, [pts], color)
            cv2.polylines(img, [pts], True, (255, 255, 255), 3)
            cv2.putText(img, "BL", (x - 15, y + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        elif i == 3:  # Bottom-right - Diamond
            pts = np.array([[x, y - size], [x + size, y], [x, y + size], [x - size, y]], np.int32)
            cv2.fillPoly(img, [pts], color)
            cv2.polylines(img, [pts], True, (255, 255, 255), 3)
            cv2.putText(img, "BR", (x - 15, y + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

def main():
    try:
        # Validate input
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Missing arguments"}))
            return

        path = sys.argv[1]
        no_questions = int(sys.argv[2])

        if no_questions > 60 or no_questions <= 0:
            print(json.dumps({"error": "Number must be between 1 and 60"}))
            return

        # Configuration
        widthImg = 700
        heightImg = 700
        choices = 5
        
        # Parse the answers array from the JSON string
        ans = json.loads(sys.argv[3])
        
        if not isinstance(ans, list) or len(ans) != no_questions:
            print(json.dumps({"error": "Invalid answers format"}))
            return
        
        # Load image
        img = cv2.imread(path)
        if img is None:
            raise Exception("Could not read image file")

        # Preprocessing
        img = cv2.resize(img, (widthImg, heightImg))
        img_orig = img.copy()
        imgGray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        imgBlur = cv2.GaussianBlur(imgGray, (5, 5), 1)
        imgCanny = cv2.Canny(imgBlur, 10, 70)

        # Find contours
        contours, _ = cv2.findContours(imgCanny, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Find rectangle contours
        def rectContour(contours):
            rectCon = []
            for i in contours:
                area = cv2.contourArea(i)
                if area > 50:
                    peri = cv2.arcLength(i, True)
                    approx = cv2.approxPolyDP(i, 0.02 * peri, True)
                    if len(approx) == 4:
                        rectCon.append(i)
            return sorted(rectCon, key=cv2.contourArea, reverse=True)

        rectCon = rectContour(contours)
        if not rectCon:
            print(json.dumps({"error": "No document detected"}))
            return

        # Get corner points
        def getCornerPoints(cont):
            peri = cv2.arcLength(cont, True)
            return cv2.approxPolyDP(cont, 0.02 * peri, True)

        biggestContour = getCornerPoints(rectCon[0])
        if biggestContour.size == 0:
            print(json.dumps({"error": "Could not detect document corners"}))
            return

        # Reorder points
        def reorder(myPoints):
            myPoints = myPoints.reshape((4, 2))
            myPointsNew = np.zeros((4, 1, 2), np.int32)
            add = myPoints.sum(1)
            myPointsNew[0] = myPoints[np.argmin(add)]
            myPointsNew[3] = myPoints[np.argmax(add)]
            diff = np.diff(myPoints, axis=1)
            myPointsNew[1] = myPoints[np.argmin(diff)]
            myPointsNew[2] = myPoints[np.argmax(diff)]
            return myPointsNew

        biggestContour = reorder(biggestContour)

        # Create a copy of the original image to draw corner markers
        img_with_corners = img_orig.copy()
        
        # Draw corner markers on the original image
        draw_corner_markers(img_with_corners, biggestContour, color=(0, 255, 255), size=15)
        
        # Also draw the contour outline
        cv2.drawContours(img_with_corners, [biggestContour], -1, (0, 255, 0), 3)

        # Perspective transform
        pts1 = np.float32(biggestContour)
        pts2 = np.float32([[0, 0], [widthImg, 0], [0, heightImg], [widthImg, heightImg]])
        matrix = cv2.getPerspectiveTransform(pts1, pts2)
        imgWarpColored = cv2.warpPerspective(img, matrix, (widthImg, heightImg))

        # Thresholding
        imgWarpGray = cv2.cvtColor(imgWarpColored, cv2.COLOR_BGR2GRAY)
        imgThresh = cv2.adaptiveThreshold(
            imgWarpGray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
            cv2.THRESH_BINARY_INV, 199, 20
        )

        # Split into boxes
        def splitBoxes(img, grid_rows=20, grid_cols=20):
            cell_h = img.shape[0] // grid_rows
            cell_w = img.shape[1] // grid_cols
            boxes = []
            rows_split = np.vsplit(img, grid_rows)
            for row in rows_split:
                cols_split = np.hsplit(row, grid_cols)
                boxes.append(cols_split)
            return boxes, cell_w, cell_h

        boxes, cell_w, cell_h = splitBoxes(imgThresh)

        # Analyze answers
        myPixelVal = np.zeros((no_questions, choices))
        for q in range(no_questions):
            if q < 20:
                row = q
                offset = 1
            elif q < 40:
                row = q - 20
                offset = 8
            else:
                row = q - 40
                offset = 15
            
            for i, c in enumerate(range(offset, offset+5)):
                box = boxes[row][c]
                myPixelVal[q][i] = cv2.countNonZero(box) / float(box.size)

        # Calculate results
        myIndex = [np.argmax(row) for row in myPixelVal]
        grading = [1 if ans[q] == myIndex[q] else 0 for q in range(no_questions)]
        score = sum(grading)

        # Create visualization
        imgVisualization = np.zeros_like(imgWarpColored)
        
        # Draw answer markers
        for q in range(no_questions):
            if q < 20:
                row = q
                offset = 1
            elif q < 40:
                row = q - 20
                offset = 8
            else:
                row = q - 40
                offset = 15
            
            # Correct answer (small green circle)
            x_correct = int((offset + ans[q] + 0.5) * cell_w)
            y_pos = int((row + 0.5) * cell_h)
            cv2.circle(imgVisualization, (x_correct, y_pos), 10, (0, 255, 0), 2)
            
            # Student answer (colored circle)
            x_student = int((offset + myIndex[q] + 0.5) * cell_w)
            color = (0, 255, 0) if grading[q] == 1 else (0, 0, 255)
            cv2.circle(imgVisualization, (x_student, y_pos), 15, color, 3)

        # Inverse perspective transform
        invMatrix = cv2.getPerspectiveTransform(pts2, pts1)
        imgInvWarp = cv2.warpPerspective(imgVisualization, invMatrix, (widthImg, heightImg))
        imgFinal = cv2.addWeighted(img_orig, 1, imgInvWarp, 0.7, 0)

        # Resize and combine images (now showing corner detection + final result)
        img_corners_small = cv2.resize(img_with_corners, (350, 350))
        img_final_small = cv2.resize(imgFinal, (350, 350))
        img_combined = np.hstack((img_corners_small, img_final_small))

        # Prepare result
        result = {
            "score": int(score),
            "correct": int(sum(grading)),
            "total": no_questions,
            "grading": grading,
            "image": image_to_base64(img_combined),
            "image_type": "jpg"
        }
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return

if __name__ == "__main__":
    main()
