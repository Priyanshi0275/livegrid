pipeline {
    agent any

    environment {
        COMPOSE_PROJECT_NAME = "livegrid"
    }

    stages {
        stage('Checkout') {
            steps {
                echo '📥 Pulling latest code...'
                checkout scm
            }
        }

        stage('Build Images') {
            steps {
                echo '🔨 Building Docker images...'
                sh 'docker compose build --no-cache'
            }
        }

        stage('Stop Old Containers') {
            steps {
                echo '🛑 Stopping old containers...'
                sh 'docker compose down --remove-orphans || true'
            }
        }

        stage('Run Test Suite') {
            steps {
                echo '🧪 Running smoke test against target API...'
                sh '''
                    docker compose up -d target-api
                    sleep 3
                    curl -f http://localhost:4000/health || exit 1
                    docker compose down
                '''
            }
        }

        stage('Deploy') {
            steps {
                echo '🚀 Deploying all services...'
                sh 'docker compose up -d'
                sh 'sleep 5'
                sh 'docker compose ps'
            }
        }

        stage('Health Check') {
            steps {
                echo '✅ Verifying services are up...'
                sh 'curl -f http://localhost:4000/health || exit 1'
                sh 'curl -f http://localhost:4000/health || exit 1'
                echo '✅ All services healthy!'
            }
        }
    }

    post {
        success {
            echo '🎉 LiveGrid deployed successfully!'
        }
        failure {
            echo '❌ Deployment failed. Rolling back...'
            sh 'docker compose down || true'
        }
    }
}
