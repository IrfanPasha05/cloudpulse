pipeline {
    agent any

    environment {
        IMAGE_NAME   = "cloudpulse"
        IMAGE_TAG    = "${env.BUILD_NUMBER}"
        DOCKERHUB_NS = "your-dockerhub-username"          // update to your namespace
        EC2_HOST     = "ubuntu@<EC2_PUBLIC_IP>"            // update to your instance
        DEPLOY_DIR   = "/home/ubuntu/cloudpulse"
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

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

        stage('Docker build') {
            steps {
                sh "docker build -t ${DOCKERHUB_NS}/${IMAGE_NAME}:${IMAGE_TAG} -t ${DOCKERHUB_NS}/${IMAGE_NAME}:latest ."
            }
        }

        stage('Docker push') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-creds', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker push ${DOCKERHUB_NS}/${IMAGE_NAME}:${IMAGE_TAG}
                        docker push ${DOCKERHUB_NS}/${IMAGE_NAME}:latest
                    '''
                }
            }
        }

        stage('Deploy to EC2') {
            steps {
                sshagent(credentials: ['ec2-ssh-key']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no ${EC2_HOST} "
                            mkdir -p ${DEPLOY_DIR} &&
                            cd ${DEPLOY_DIR}
                        "
                        scp -o StrictHostKeyChecking=no docker-compose.yml ${EC2_HOST}:${DEPLOY_DIR}/docker-compose.yml
                        ssh -o StrictHostKeyChecking=no ${EC2_HOST} "
                            cd ${DEPLOY_DIR} &&
                            export IMAGE=${DOCKERHUB_NS}/${IMAGE_NAME}:${IMAGE_TAG} &&
                            docker compose pull &&
                            docker compose up -d --remove-orphans &&
                            docker image prune -f
                        "
                    '''
                }
            }
        }

        stage('Smoke test') {
            steps {
                sh '''
                    for i in 1 2 3 4 5; do
                        if curl -sf http://<EC2_PUBLIC_IP>:3000/healthz; then
                            echo "Deployment healthy"
                            exit 0
                        fi
                        sleep 5
                    done
                    echo "Health check failed" && exit 1
                '''
            }
        }
    }

    post {
        success {
            echo "Build #${env.BUILD_NUMBER} deployed successfully to EC2."
        }
        failure {
            echo "Build #${env.BUILD_NUMBER} failed. Check stage logs above."
        }
        always {
            sh 'docker logout || true'
        }
    }
}
