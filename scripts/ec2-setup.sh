#!/bin/bash
set -e

echo "🚀 Starting Stripe Guardian EC2 Setup..."

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "❌ Cannot detect OS. Please install Docker manually."
    exit 1
fi

echo "📦 Installing Docker and Docker Compose for $OS..."

if [[ "$OS" == "amzn" || "$OS" == "rhel" || "$OS" == "centos" ]]; then
    sudo yum update -y
    sudo yum install -y docker git
    sudo service docker start
    sudo usermod -a -G docker ec2-user || sudo usermod -a -G docker $USER

    # Install docker-compose
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose

elif [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    sudo apt-get update -y
    sudo apt-get install -y docker.io docker-compose git
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -a -G docker ubuntu || sudo usermod -a -G docker $USER
else
    echo "⚠️ Unsupported setup OS for auto-install. Proceeding to clone repository only..."
fi

echo "📥 Cloning Stripe Guardian Repository..."
if [ -d "stripe-guardian" ]; then
    echo "Directory already exists. Pulling latest..."
    cd stripe-guardian
    git pull
else
    # Prompt for repo if running locally, otherwise fall back to generic URL
    # Replace the URL with your actual Git repo
    git clone https://github.com/Webcap/stripe-guardian.git || echo "⚠️ Please clone the repository manually."
    cd stripe-guardian || exit
fi

echo "✅ Setup Complete!"
echo "Next steps:"
echo "1. Run 'logout' and log back in to apply Docker permissions."
echo "2. Navigate to the repo: cd stripe-guardian"
echo "3. Create your .env file: cp env-template.txt .env && nano .env"
echo "4. Start the application: docker-compose up -d"
