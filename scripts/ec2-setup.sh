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

    # Install docker-buildx (for Amazon Linux 2023)
    mkdir -p ~/.docker/cli-plugins
    curl -sL "https://github.com/docker/buildx/releases/latest/download/buildx-v0.19.0.linux-amd64" -o ~/.docker/cli-plugins/docker-buildx
    chmod +x ~/.docker/cli-plugins/docker-buildx

elif [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    sudo apt-get update -y
    sudo apt-get install -y docker.io docker-compose git
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -a -G docker ubuntu || sudo usermod -a -G docker $USER
else
    echo "⚠️ Unsupported setup OS for auto-install. Proceeding to clone repository only..."
fi

echo "✅ Setup Complete!"
echo "Next steps:"
echo "1. Run 'logout' and log back in to apply Docker permissions."
echo "2. Navigate to your repository directory"
echo "3. Create your .env file: cp env-template.txt .env && nano .env"
echo "4. Start the application: docker-compose up -d"
