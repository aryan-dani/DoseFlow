const { jsPDF } = window.jspdf; // Import jsPDF from the global scope
// Tesseract is available globally via the script tag

document.addEventListener("DOMContentLoaded", () => {
  // Set the PDF.js worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

  const uploadInput = document.getElementById("medication-upload");
  const imagePreview = document.getElementById("image-preview");
  const infoSection = document.getElementById("info-section");
  const medicationDetailsList = document.getElementById("medication-details");
  const ttsButton = document.getElementById("tts-button");
  const downloadPdfButton = document.getElementById("download-pdf-button");
  const loadingIndicator = document.getElementById("loading-indicator");
  const pdfMessage = document.getElementById("pdf-message");

  // TTS state variables
  let isSpeaking = false;
  let isPaused = false;
  let currentUtterance = null;

  // Tesseract worker (initialize once)
  let worker = null;
  async function initializeWorker() {
    if (!worker) {
      // Show progress in the loading indicator
      loadingIndicator.textContent = "Loading OCR Engine...";
      loadingIndicator.style.display = "block";
      worker = await Tesseract.createWorker("eng", 1, {
        // 'eng' for English, 1 for LSTM OCR engine
        logger: (m) => {
          console.log(m);
          // Update loading indicator with progress
          if (m.status === "recognizing text") {
            loadingIndicator.textContent = `Processing: ${Math.round(
              m.progress * 100
            )}%`;
          } else if (m.status === "loading language model") {
            loadingIndicator.textContent = "Loading Language Model...";
          } else {
            loadingIndicator.textContent =
              m.status.charAt(0).toUpperCase() + m.status.slice(1) + "...";
          }
        },
      });
      loadingIndicator.textContent = "OCR Engine Ready."; // Indicate readiness
      console.log("Tesseract worker initialized.");
    }
    return worker;
  }

  // Initialize worker when the page loads
  initializeWorker();

  uploadInput.addEventListener("change", handleFileUpload); // Renamed for clarity
  ttsButton.addEventListener("click", handleTTSButtonClick);
  downloadPdfButton.addEventListener("click", generateAndDownloadPDF);

  async function handleFileUpload(event) {
    console.log("handleFileUpload started"); // Added log
    const file = event.target.files[0];
    if (!file) {
      console.log("No file selected"); // Added log
      resetApp();
      return;
    }
    console.log(`File selected: ${file.name}, type: ${file.type}`); // Added log

    if (file.type.startsWith("image/")) {
      console.log("Processing as image..."); // Added log
      resetApp();
      loadingIndicator.textContent = "Processing Image...";
      loadingIndicator.style.display = "block";
      imagePreview.style.display = "none";
      pdfMessage.style.display = "none";

      const reader = new FileReader();
      reader.onload = async function (e) {
        console.log("Image FileReader onload triggered"); // Added log
        imagePreview.src = e.target.result;
        imagePreview.style.display = "block";
        try {
          // Added try...catch around processWithTesseract
          await processWithTesseract(e.target.result); // Process the image data URL
        } catch (error) {
          console.error("Error directly calling processWithTesseract:", error); // Added log
          loadingIndicator.textContent = "Image processing failed.";
        }
      };
      reader.onerror = function (e) {
        // Added onerror handler
        console.error("Image FileReader error:", e); // Added log
        loadingIndicator.textContent = "Failed to read image file.";
      };
      reader.readAsDataURL(file);
    } else if (file.type === "application/pdf") {
      console.log("Processing as PDF..."); // Added log
      resetApp();
      loadingIndicator.textContent = "Processing PDF...";
      loadingIndicator.style.display = "block";
      pdfMessage.textContent = "PDF processing may take a moment...";
      pdfMessage.style.display = "block";
      imagePreview.style.display = "none";

      const reader = new FileReader();
      reader.onload = async function (e) {
        console.log("PDF FileReader onload triggered"); // Added log
        try {
          await processPDF(new Uint8Array(e.target.result));
        } catch (error) {
          // Error is already logged inside processPDF, but log here too for context
          console.error("Error occurred during processPDF call:", error); // Added log
          loadingIndicator.textContent =
            "Failed to process PDF. Check console for details."; // Updated message
        }
      };
      reader.onerror = function (e) {
        // Added onerror handler
        console.error("PDF FileReader error:", e); // Added log
        loadingIndicator.textContent = "Failed to read PDF file.";
      };
      reader.readAsArrayBuffer(file);
    } else {
      resetApp();
      alert("Please upload a valid image file or PDF.");
    }
  }

  // Function to process PDF files
  async function processPDF(pdfData) {
    console.log("processPDF started"); // Added log
    try {
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      console.log(`PDF loaded: ${pdf.numPages} pages`); // Added log
      loadingIndicator.textContent = `PDF loaded. Processing ${pdf.numPages} page(s)...`;

      // Collect text from all pages
      let allText = "";

      // Process all pages
      const maxPagesToProcess = pdf.numPages; // Changed to process all pages

      for (let pageNum = 1; pageNum <= maxPagesToProcess; pageNum++) {
        console.log(`Processing page ${pageNum}`); // Added log
        // Update loading indicator for each page
        loadingIndicator.textContent = `Processing page ${pageNum} of ${maxPagesToProcess}...`;

        // Get the page
        const page = await pdf.getPage(pageNum);
        // Increased scale slightly for potentially better OCR on denser text
        const viewport = page.getViewport({ scale: 2.0 });

        // Create a canvas element to render the PDF page
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Render the PDF page to the canvas
        console.log(`Rendering page ${pageNum} to canvas...`); // Added log
        await page.render({
          canvasContext: context,
          viewport: viewport,
        }).promise;
        console.log(`Page ${pageNum} rendered.`); // Added log

        // Convert canvas to image data URL
        const imageDataUrl = canvas.toDataURL("image/png");
        console.log(
          `Page ${pageNum} converted to data URL (length: ${imageDataUrl.length})`
        ); // Added log

        // Process the image data with Tesseract OCR
        loadingIndicator.textContent = `Running OCR on page ${pageNum} of ${maxPagesToProcess}...`;
        console.log(
          `Initializing/getting Tesseract worker for page ${pageNum}...`
        ); // Added log
        const tesseractWorker = await initializeWorker();
        console.log(`Worker ready. Running OCR on page ${pageNum}...`); // Added log
        const {
          data: { text },
        } = await tesseractWorker.recognize(imageDataUrl);
        console.log(
          `OCR complete for page ${pageNum}. Text length: ${text.length}`
        ); // Added log

        allText += text + "\n\n";
      }

      // Process the extracted text
      console.log("All pages processed. Analyzing extracted text..."); // Added log
      loadingIndicator.textContent = "Analyzing extracted text...";
      displayMedicationInfoFromText(allText);
      loadingIndicator.style.display = "none";
      console.log("processPDF finished successfully."); // Added log
    } catch (error) {
      console.error("Error within processPDF function:", error); // Enhanced log
      loadingIndicator.textContent = "Error processing PDF. Check console."; // Updated message
      // Re-throw the error so the caller knows it failed
      throw error;
    }
  }

  // Function to perform OCR using Tesseract.js
  async function processWithTesseract(imageDataUrl) {
    console.log("processWithTesseract started"); // Added log
    try {
      console.log("Initializing/getting Tesseract worker..."); // Added log
      const tesseractWorker = await initializeWorker(); // Ensure worker is ready
      console.log("Worker ready. Recognizing text..."); // Added log
      loadingIndicator.textContent = "Recognizing Text...";
      loadingIndicator.style.display = "block"; // Ensure it's visible

      const {
        data: { text },
      } = await tesseractWorker.recognize(imageDataUrl);

      console.log(`OCR complete. Text length: ${text.length}`); // Added log
      // console.log("OCR Result:", text); // Keep this commented unless needed for debugging large text
      loadingIndicator.style.display = "none"; // Hide loading indicator
      displayMedicationInfoFromText(text); // Pass the extracted text
      console.log("processWithTesseract finished successfully."); // Added log
    } catch (error) {
      console.error("Error within processWithTesseract function:", error); // Enhanced log
      loadingIndicator.textContent = "OCR Failed. Check console."; // Updated message
      // Keep the indicator visible to show the error
      infoSection.style.display = "none"; // Hide info section on error
      // Re-throw the error so the caller knows it failed
      throw error;
    }
  }

  // Modify displayMedicationInfo to parse the OCR text
  function displayMedicationInfoFromText(ocrText) {
    console.log(
      `displayMedicationInfoFromText called. Text length: ${ocrText.length}`
    ); // Added log
    // console.log(`Parsing OCR text:\n${ocrText}`); // Keep commented unless needed

    // Placeholder parsing logic (replace with robust parsing)
    const extractedData = parseOcrText(ocrText);

    // --- Simplification ---
    const simplifiedData = {
      "Drug Name": extractedData.drugName || "Not Found",
      Strength: extractedData.dosage || "Not Found",
      "How Often": extractedData.frequency
        ? simplifyFrequency(extractedData.frequency)
        : "Not Found",
      "How to Take": extractedData.instructions || "Not Found",
      "Important Warnings": extractedData.warnings || "Not Found",
      "Raw OCR Text":
        ocrText.substring(0, 200) + (ocrText.length > 200 ? "..." : ""), // Show snippet of raw text for debugging
    };

    // Clear previous details
    medicationDetailsList.innerHTML = "";

    // Populate the list
    for (const [key, value] of Object.entries(simplifiedData)) {
      if (value && value !== "Not Found") {
        // Only display found items
        const listItem = document.createElement("li");
        listItem.dataset.key = key;
        listItem.dataset.value = value;
        listItem.innerHTML = `<strong>${key}:</strong> ${value}`;
        medicationDetailsList.appendChild(listItem);
      }
    }

    // Show the info section only if some data was potentially found
    if (
      Object.values(simplifiedData).some(
        (v) => v && v !== "Not Found" && v !== "Raw OCR Text"
      )
    ) {
      infoSection.style.display = "block";
      resetTTSState();
    } else {
      infoSection.style.display = "none";
      alert(
        "Could not extract significant medication details from the image/PDF. Please try a clearer document."
      );
    }
  }

  // Improved parsing function with better keyword detection
  function parseOcrText(text) {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line);
    const data = {
      drugName: null,
      dosage: null,
      frequency: null,
      instructions: null,
      warnings: null,
    };

    // Common medication-related keywords
    const drugNameKeywords = [
      "tablet",
      "capsule",
      "caplet",
      "pill",
      "solution",
      "injection",
      "suspension",
      "mg",
      "mcg",
      "ml",
    ];
    const dosageKeywords = [
      "mg",
      "mcg",
      "ml",
      "g",
      "%",
      "microgram",
      "milligram",
    ];
    const frequencyKeywords = [
      "daily",
      "twice",
      "once",
      "every",
      "hours",
      "morning",
      "evening",
      "night",
      "weekly",
      "monthly",
      "day",
      "week",
      "month",
      "hourly",
    ];
    const instructionKeywords = [
      "take",
      "with",
      "food",
      "water",
      "milk",
      "empty stomach",
      "before",
      "after",
      "meals",
      "swallow",
      "dissolve",
      "chew",
      "break",
      "crush",
    ];
    const warningKeywords = [
      "warning",
      "caution",
      "precaution",
      "avoid",
      "alcohol",
      "driving",
      "machinery",
      "pregnancy",
      "allergic",
      "reaction",
      "stop",
      "discontinue",
      "doctor",
      "pharmacy",
      "immediately",
    ];

    // Process each line
    lines.forEach((line) => {
      const lowerLine = line.toLowerCase();

      // Look for drug name
      if (!data.drugName) {
        // Look for capitalized words which are commonly drug names
        const capitalizedWords = line.match(/[A-Z][a-z]{2,}/g);
        if (capitalizedWords && capitalizedWords.length > 0) {
          // Check if any capitalized word is near a drug name keyword
          if (drugNameKeywords.some((keyword) => lowerLine.includes(keyword))) {
            data.drugName = capitalizedWords[0];
          }
        }
      }

      // Look for dosage (numbers followed by units)
      if (!data.dosage && line.match(/\d+(\.\d+)?\s?(mg|mcg|ml|g|%)/i)) {
        data.dosage = line.match(/\d+(\.\d+)?\s?(mg|mcg|ml|g|%)/i)[0];
      }

      // Look for frequency information
      if (
        !data.frequency &&
        frequencyKeywords.some((keyword) => lowerLine.includes(keyword))
      ) {
        // Check for common frequency patterns
        if (
          lowerLine.match(
            /(once|twice|three times|1 time|2 times|3 times).*day/
          )
        ) {
          data.frequency = line;
        } else if (lowerLine.match(/every\s+\d+\s+(hours|days|weeks)/)) {
          data.frequency = line;
        } else if (
          frequencyKeywords.some((keyword) => lowerLine.includes(keyword))
        ) {
          // If no specific pattern, but contains frequency keywords
          data.frequency = line;
        }
      }

      // Look for instructions
      if (
        !data.instructions &&
        instructionKeywords.some((keyword) => lowerLine.includes(keyword))
      ) {
        data.instructions = line;
      }

      // Look for warnings
      if (warningKeywords.some((keyword) => lowerLine.includes(keyword))) {
        // Collect all warning lines
        data.warnings = data.warnings ? data.warnings + " " + line : line;
      }
    });

    // If drug name wasn't found using other methods, look for likely candidates
    if (!data.drugName && lines.length > 0) {
      // Try to find a prominent capitalized line that might be the drug name
      for (let i = 0; i < Math.min(5, lines.length); i++) {
        const line = lines[i];
        // Look for a line with capitalized words that might be a drug name
        if (line.match(/[A-Z][a-z]{2,}/)) {
          data.drugName = line.match(/[A-Z][a-z]{2,}/)[0];
          break;
        }
      }

      // If still not found, just use the first line as a fallback
      if (!data.drugName) {
        data.drugName = lines[0];
      }
    }

    return data;
  }

  function simplifyFrequency(freqText) {
    const lowerFreq = freqText.toLowerCase();
    if (lowerFreq.includes("twice") && lowerFreq.includes("daily")) {
      return "Take 2 times a day.";
    }
    if (
      (lowerFreq.includes("once") || lowerFreq.includes("one time")) &&
      lowerFreq.includes("daily")
    ) {
      return "Take 1 time a day.";
    }
    if (lowerFreq.includes("three times") && lowerFreq.includes("day")) {
      return "Take 3 times a day.";
    }
    if (lowerFreq.match(/every\s+(\d+)\s+hours/)) {
      const hours = lowerFreq.match(/every\s+(\d+)\s+hours/)[1];
      return `Take every ${hours} hours.`;
    }
    if (lowerFreq.includes("morning")) {
      return "Take in the morning.";
    }
    if (lowerFreq.includes("bedtime") || lowerFreq.includes("night")) {
      return "Take at bedtime.";
    }
    return freqText;
  }

  function handleTTSButtonClick() {
    if (!("speechSynthesis" in window)) {
      alert("Sorry, your browser does not support Text-to-Speech.");
      return;
    }

    if (!isSpeaking) {
      // Start speaking
      startSpeaking();
    } else {
      if (isPaused) {
        // Resume speaking
        resumeSpeaking();
      } else {
        // Pause speaking
        pauseSpeaking();
      }
    }
  }

  function startSpeaking() {
    const detailsToSpeak = [];
    medicationDetailsList.querySelectorAll("li").forEach((item) => {
      // Use dataset if available, otherwise parse text
      const key =
        item.dataset.key ||
        item.querySelector("strong").textContent.replace(":", "");
      const value =
        item.dataset.value ||
        item.textContent
          .replace(item.querySelector("strong").textContent, "")
          .trim();
      // Skip speaking the raw OCR text
      if (key.toLowerCase() !== "raw ocr text") {
        detailsToSpeak.push(`${key}. ${value}.`);
      }
    });

    if (detailsToSpeak.length === 0) return; // Nothing to speak

    const fullText = detailsToSpeak.join(" ");
    currentUtterance = new SpeechSynthesisUtterance(fullText);

    currentUtterance.onstart = () => {
      console.log("Speech started");
      isSpeaking = true;
      isPaused = false;
      ttsButton.textContent = "Pause";
    };

    currentUtterance.onpause = () => {
      console.log("Speech paused");
      isPaused = true;
      ttsButton.textContent = "Resume";
    };

    currentUtterance.onresume = () => {
      console.log("Speech resumed");
      isPaused = false;
      ttsButton.textContent = "Pause";
    };

    currentUtterance.onend = () => {
      console.log("Speech finished");
      resetTTSState();
    };

    currentUtterance.onerror = (event) => {
      console.error("Speech synthesis error:", event.error);
      alert(`An error occurred during speech synthesis: ${event.error}`);
      resetTTSState();
    };

    window.speechSynthesis.cancel(); // Cancel any previous speech just in case
    window.speechSynthesis.speak(currentUtterance);
  }

  function pauseSpeaking() {
    if (window.speechSynthesis.speaking && !isPaused) {
      window.speechSynthesis.pause();
    }
  }

  function resumeSpeaking() {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  }

  function resetTTSState() {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    isSpeaking = false;
    isPaused = false;
    currentUtterance = null;
    ttsButton.textContent = "Read Aloud";
  }

  // --- PDF Generation ---
  function generateAndDownloadPDF() {
    if (!medicationDetailsList.hasChildNodes()) {
      alert("No medication information available to download.");
      return;
    }

    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;
    let yPos = margin; // Start position for text

    // Add Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Simplified Medication Guide", pageWidth / 2, yPos, {
      align: "center",
    });
    yPos += 15;

    // Add Medication Details
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");

    medicationDetailsList.querySelectorAll("li").forEach((item, index) => {
      const key = item.dataset.key || "Detail"; // Fallback key
      const value =
        item.dataset.value ||
        item.textContent
          .replace(item.querySelector("strong")?.textContent || "", "")
          .trim(); // Fallback value extraction

      // Skip Raw OCR Text in PDF
      if (key.toLowerCase() === "raw ocr text") {
        return; // Skip this item
      }

      // Set key style (bold)
      doc.setFont("helvetica", "bold");
      let keyText = `${key}:`;
      let keyWidth = doc.getTextWidth(keyText) + 2; // Width of the key + space

      // Check if content fits on the current line/page
      if (yPos + 6 > pageHeight - margin) {
        // Estimate line height + check page boundary
        doc.addPage();
        yPos = margin;
      }
      doc.text(keyText, margin, yPos);

      // Set value style (normal)
      doc.setFont("helvetica", "normal");
      // Calculate available width for the value
      let valueMaxWidth = pageWidth - margin - margin - keyWidth;
      // Split value text if it's too long
      let valueLines = doc.splitTextToSize(value, valueMaxWidth);

      // Print value lines
      doc.text(valueLines, margin + keyWidth, yPos);

      // Update yPos based on the number of lines the value took
      yPos += valueLines.length * 6; // Adjust line height as needed (approx 6 units per line)
      yPos += 4; // Add extra space between list items
    });

    // Add Footer
    const footerText = `Generated by DoseFlow on ${new Date().toLocaleDateString()}`;
    doc.setFontSize(10);
    doc.setTextColor(150); // Grey color
    doc.text(footerText, margin, pageHeight - 10);

    // Trigger Download
    doc.save("DoseFlow_Medication_Guide.pdf");
  }

  function resetApp() {
    loadingIndicator.textContent = "Processing..."; // Reset text
    loadingIndicator.style.display = "none";
    pdfMessage.style.display = "none";
    imagePreview.src = "#";
    imagePreview.style.display = "none";
    infoSection.style.display = "none";
    medicationDetailsList.innerHTML = "";
    uploadInput.value = "";
    resetTTSState();
    // Don't terminate the worker here, keep it ready
  }

  // Initial state
  resetApp();
  // Ensure worker starts loading on page load
  initializeWorker().catch((err) =>
    console.error("Failed to initialize Tesseract worker on load:", err)
  );
});
