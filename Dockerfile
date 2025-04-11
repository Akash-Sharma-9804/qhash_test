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

# Use an official Node.js image with Python and Debian base
FROM node:18-bullseye

# Install Python3, pip3, Tesseract OCR, and image dependencies
RUN apt-get update && \
    apt-get install -y python3 python3-pip tesseract-ocr libglib2.0-0 libsm6 libxext6 libxrender-dev git curl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy everything into the image
COPY . .

# Install Python dependencies
RUN pip3 install --no-cache-dir -r python_text_extractor/requirements.txt

# Install Node.js dependencies
RUN npm install

# Expose the port you're using (based on your server.js)
EXPOSE 10000

# Start your Node.js server
CMD ["node", "server.js"]
