FROM python:3.11-slim

WORKDIR /app

# Build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend files
COPY . .

# Hugging Face Spaces port 7860 expect karta hai
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]