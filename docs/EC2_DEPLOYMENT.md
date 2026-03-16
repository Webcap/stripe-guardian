# Stripe Guardian - AWS EC2 Deployment Guide

This guide will walk you through the process of getting Stripe Guardian up and running on a fresh Amazon Web Services (AWS) EC2 instance using Docker and Docker Compose.

---

## Step 1: Launch an EC2 Instance
1. Log into your AWS Console and go to **EC2 > Instances > Launch instances**.
2. **Name:** Give your instance a name (e.g., `stripe-guardian-api`).
3. **AMI:** Select **Amazon Linux 2023 AMI** or **Ubuntu Server 24.04 LTS**.
4. **Instance Type:** `t3.micro` or `t3.small` is typically sufficient.
5. **Key Pair:** Create a new key pair or select an existing one (you need this to SSH into the box).
6. **Network Settings:** Ensure the instance is in a public subnet with a public IP. Edit the Security Group to allow:
    - **SSH (Port 22)** from your IP address.
    - **HTTP (Port 80)** from Anywhere (0.0.0.0/0).
7. **Storage:** Standard 8GB is sufficient.
8. Click **Launch instance**.

---

## Step 2: Connect to your EC2 Instance
Once the instance status changes to "Running", copy its Public IPv4 address.

Open your terminal and SSH into the instance:
```bash
# If using Amazon Linux
ssh -i /path/to/your/key.pem ec2-user@<YOUR_EC2_PUBLIC_IP>

# If using Ubuntu
ssh -i /path/to/your/key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

---

## Step 3: Run the Auto-Setup Script
Navigate to the directory where your repository is located on the EC2 instance. We provide a setup script that will automatically install Docker and Docker Compose. Run this command:

```bash
bash ./scripts/ec2-setup.sh
```

---

## Step 4: Apply Docker Permissions
The setup script adds your user to the Docker group. To apply this change without rebooting, log out of your SSH session and log back in, or run:
```bash
newgrp docker
```
Verify Docker is running:
```bash
docker --version
```

---

## Step 5: Configure Environment Variables
Navigate to the newly cloned repository directory:
```bash
cd stripe-guardian
```

You need to set up your environment variables. Create a `.env` file from the template (if one exists) or create a blank one:
```bash
nano .env
```
Paste your Stripe and Supabase credentials exactly like this:
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://<your_supabase_project>.supabase.co
WIZNOTE_SUPABASE_SECRET_KEY=sb_secret_...
```
*(Press `Ctrl+O`, `Enter`, then `Ctrl+X` to save and exit nano)*

---

## Step 6: Start the Services
Now that Docker is installed and the environment variables are configured, start up Stripe Guardian using Docker Compose.

```bash
docker-compose up -d
```
This command will build the Docker container and start the Nginx proxy, making the API accessible on port `80`. 

To verify everything is running, check the container logs:
```bash
docker-compose logs -f
```

---

## Step 7: Update Stripe Webhooks
Stripe Guardian is now running globally on your EC2 instance's IP. 

1. Go to your [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks).
2. Click **Add an endpoint**.
3. Set the Endpoint URL to your EC2 IP address:
```
http://<YOUR_EC2_PUBLIC_IP>/api/webhook
```
4. Select the events you want to listen to (e.g., `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`).
5. Click Add endpoint.
6. **Important:** Grab the new "Signing secret" (`whsec_...`) from the webhook settings in Stripe, and update the `STRIPE_WEBHOOK_SECRET` in your EC2 `.env` file with the new secret. Restart the container if you change it (`docker-compose down && docker-compose up -d`).

**You are completely finished! Your AWS EC2 deployment is active.**
