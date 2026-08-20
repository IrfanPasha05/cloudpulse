pipeline {
    agent any

    stages {
        stage('Test EC2 SSH') {
            steps {
                sshagent(credentials: ['ec2-ssh-key']) {
                    sh '''
                        ssh -o StrictHostKeyChecking=no \
                            ubuntu@3.110.223.230 \
                            "echo SSH connection successful && hostname && docker --version && docker compose version"
                    '''
                }
            }
        }
    }
}