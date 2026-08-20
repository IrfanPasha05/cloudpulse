pipeline {
    agent any

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    stages {
        stage('Install dependencies') {
            steps { sh 'npm ci' }
        }

        stage('Test') {
            steps { sh 'npm test' }
        }

        stage('Docker Build') {
            steps { sh 'docker build -t cloudpulse:latest .' }
        }

        stage('Run Container') {
            steps {
                sh '''
                    docker rm -f cloudpulse || true

                    docker run -d \\
                        --name cloudpulse \\
                        --restart unless-stopped \\
                        --add-host=host.docker.internal:host-gateway \\
                        -e JENKINS_URL=http://host.docker.internal:8080 \\
                        -e JENKINS_JOB=CloudPulse-CI-CD \\
                        -p 3000:3000 \\
                        cloudpulse:latest
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    for i in 1 2 3 4 5; do
                        if curl -sf http://localhost:3000/healthz; then
                            echo "CloudPulse is healthy"
                            exit 0
                        fi
                        sleep 2
                    done
                    echo "CloudPulse health check failed"
                    docker logs cloudpulse || true
                    exit 1
                '''
            }
        }
    }

    post {
        success {
            echo 'CloudPulse is live on EC2 port 3000.'
        }
        failure {
            echo 'CloudPulse pipeline failed.'
        }
    }
}
