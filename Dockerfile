# # Use an official Node.js image with Python and Debian base
# FROM node:18-bullseye

# # Install Python3, pip3, and Tesseract OCR
# RUN apt-get update && \
#     apt-get install -y python3 python3-pip tesseract-ocr && \
#     apt-get clean

# # Create app directory
# WORKDIR /app

# # Copy everything into the image
# COPY . .

# # Install Python dependencies
# RUN pip3 install --no-cache-dir -r python_text_extractor/requirements.txt

# # Install Node.js dependencies
# RUN npm install

# # Expose the desired port (default: 3000 or whatever you're using)
# EXPOSE 3000

# # Start your server
# CMD ["node", "server.js"]

# ✅ Use a Node.js image based on Debian (for apt compatibility)
FROM node:18-bullseye

# ✅ Install Python, Tesseract OCR, and image processing dependencies
RUN apt-get update --fix-missing && \
    apt-get install -y \
    python3 \
    python3-pip \
    tesseract-ocr \
    tesseract-ocr-eng \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    git \
    curl \
    && pip3 install --upgrade pip && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ✅ Set working directory inside container
WORKDIR /app

# ✅ Copy all project files into the container
COPY . .

# ✅ Install Python dependencies from your `requirements.txt`
RUN pip3 install --no-cache-dir -r python_text_extractor/requirements.txt

# ✅ Install Node.js dependencies
RUN npm install

# ✅ Expose the port your server listens on (change if using a different port)
EXPOSE 3000

# ✅ Start the Node.js backend
CMD ["node", "server.js"]
