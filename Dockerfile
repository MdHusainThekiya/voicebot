# Use Node.js 16 (since Vosk requires it)
FROM node:16

# Set the working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of your app
COPY . .

# Expose the port (Vercel automatically sets $PORT)
EXPOSE $PORT

# Start the app
CMD ["node", "index.js"]