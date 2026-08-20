pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        stage('Install dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Test') {
            steps {
                sh 'npm test'
            }
        }

        stage('Docker Build') {
            steps {
                sh 'docker build -t cloudpulse:latest .'
            }
        }

        stage('Run Container') {
            steps {
                sh '''
                    docker rm -f cloudpulse || true

                    docker run -d \
                        --name cloudpulse \
                        -p 3000:3000 \
                        cloudpulse:latest
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    sleep 5
                    curl -f http://localhost:3000/healthz
                '''
            }
        }
    }

    post {
        always {
            sh 'docker rm -f cloudpulse || true'
        }

        success {
            echo 'CloudPulse CI/CD pipeline completed successfully!'
        }

        failure {
            echo 'CloudPulse pipeline failed.'
        }
    }
}