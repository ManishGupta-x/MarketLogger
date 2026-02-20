FROM node:20-slim

# Install Python, build tools for better-sqlite3, and Chrome dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    # Chrome/Puppeteer dependencies
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libglib2.0-0 \
    libx11-xcb1 \
    libxcb1 \
    libxshmfence1 \
    fonts-liberation \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of app
COPY . .

# Create data directory
RUN mkdir -p /data

# Expose port
EXPOSE 34000

# Start the app
CMD ["node", "src/app.js"]
