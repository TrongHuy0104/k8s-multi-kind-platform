# k8s-multi-kind-platform
 
Hệ thống microservices 2 tầng trên Kubernetes: **Backend Relay** (NestJS) + **Redis** (StatefulSet), minh họa 26 Kubernetes Kind thuộc 7 nhóm A–G.
 
---
 
## Yêu cầu môi trường
 
| Công cụ | Phiên bản | Ghi chú |
|---------|-----------|---------|
| minikube | ≥ 1.32 | |
| kubectl | ≥ 1.28 | |
| Docker | ≥ 24 | |
| Node.js | 20 LTS | |
| pnpm | ≥ 8 | `npm install -g pnpm` |
 
---
 
## Cấu trúc thư mục
 
```
k8s-multi-kind-platform/
├── apps/
│   └── relay/                  # NestJS backend
│       ├── src/
│       │   ├── app.module.ts
│       │   ├── app.controller.ts
│       │   ├── health/
│       │   │   └── health.controller.ts
│       │   └── redis/
│       │       ├── redis.module.ts
│       │       ├── redis.service.ts
│       │       └── redis.controller.ts
│       ├── Dockerfile
│       └── package.json
├── manifests/
│   ├── 00-namespace.yaml       # Namespace
│   ├── 01-config.yaml          # ConfigMap + Secret
│   ├── 01-rbac.yaml            # ServiceAccount + Role + RoleBinding
│   ├── 02-backend.yaml         # Deployment + HPA
│   ├── 03-redis.yaml           # PriorityClass + StatefulSet + Services
│   ├── 04-policy.yaml          # PodDisruptionBudget
│   ├── 05-networking.yaml      # Gateway + HTTPRoute + ClusterIP Service
│   ├── 06-network-policy.yaml  # NetworkPolicy
│   └── 07-extras.yaml          # CronJob + CRD
├── MAP.md                      # Bản đồ 26 Kind
├── DESIGN.md                   # Phân tích kiến trúc
└── README.md                   # File này
```
 
---
 
## Bước 0 — Khởi động minikube với Calico CNI
 
> **Quan trọng:** Minikube mặc định dùng `kindnet` CNI **không hỗ trợ NetworkPolicy**.
> Phải dùng Calico để enforce NetworkPolicy hoạt động đúng.
 
```bash
# Nếu đã có cluster cũ, xóa trước
minikube delete
 
# Tạo cluster mới với Calico
minikube start --cni=calico --driver=docker
 
# Chờ Calico ready (~2 phút)
kubectl wait pods -n kube-system -l k8s-app=calico-node \
  --for=condition=Ready --timeout=120s
 
# Bật metrics-server cho HPA
minikube addons enable metrics-server
 
# Xác nhận
kubectl get pods -n kube-system | grep -E "calico|metrics"
```
 
---
 
## Bước 1 — Build và load image NestJS
 
> **Quan trọng:** Minikube chạy trong VM riêng, không thấy Docker images của máy host.
> Phải dùng `minikube image load` hoặc push lên registry.
 
```bash
cd apps/relay
pnpm install
 
# Build image với tag cụ thể — KHÔNG dùng :latest
docker build -t relay:1.0.0 -f Dockerfile .
 
# Load vào minikube VM
minikube image load relay:1.0.0
 
# Xác nhận image đã có trong minikube
minikube image ls | grep relay
# → docker.io/library/relay:1.0.0
 
cd ../..
```
 
---
 
## Bước 2 — Apply manifests theo thứ tự
 
Thứ tự triển khai rất quan trọng trong Kubernetes. Bạn phải đảm bảo các tài nguyên nền tảng (Namespace, Config, RBAC) được tạo ra trước khi các ứng dụng (Workload) cần đến chúng được khởi chạy.
 
```bash
# 1. Khởi tạo Namespace
# Namespace phải được tạo đầu tiên vì tất cả các resource khác đều nằm trong nó. 
# Nếu không, K8s sẽ báo lỗi "namespace not found".
kubectl apply -f manifests/00-namespace.yaml
 
# 2. Cấu hình & Phân quyền (Config và RBAC)
# Tạo Secret/ConfigMap để các Pod có thể đọc biến môi trường (như REDIS_PASSWORD).
# Tạo Role và ServiceAccount trước để Pod có quyền truy cập API ngay khi khởi động.
kubectl apply -f manifests/01-config.yaml
kubectl apply -f manifests/01-rbac.yaml
 
# 3. Triển khai Backend Relay + HPA
# Khởi chạy stateless application NestJS. Kèm theo đó là HPA để tự động scale Pod 
# dựa trên CPU metric.
kubectl apply -f manifests/02-backend.yaml
 
# 4. Triển khai Database (Redis StatefulSet)
# Tạo StatefulSet cho Redis. Bao gồm cả PriorityClass đảm bảo Redis có độ ưu tiên cao
# và không bị evict khi node cạn kiệt tài nguyên.
kubectl apply -f manifests/03-redis.yaml
 
# 5. Áp dụng Policy (PodDisruptionBudget)
# PDB giúp bảo vệ hệ thống bằng cách chặn thao tác xóa Pod hàng loạt, 
# đảm bảo lúc nào cũng có ít nhất 1 Pod relay hoạt động.
kubectl apply -f manifests/04-policy.yaml
 
# 6. Mở cổng mạng (Networking)
# Tạo ClusterIP Service, Gateway và HTTPRoute để định tuyến traffic HTTP
# từ bên ngoài (qua port 80) vào Backend Relay.
kubectl apply -f manifests/05-networking.yaml
 
# 7. Thiếp lập bảo mật mạng (NetworkPolicy)
# Khóa toàn bộ Ingress traffic mặc định (Zero Trust) và chỉ mở một luồng duy nhất:
# cho phép các Pod có label app=relay kết nối đến Redis ở port 6379.
kubectl apply -f manifests/06-network-policy.yaml
 
# 8. Cấu hình các tài nguyên phụ trợ (CronJob + CRD)
# Lên lịch backup Redis hàng ngày lúc 2AM. Định nghĩa một CRD tùy chỉnh để 
# minh họa khả năng mở rộng API của K8s.
kubectl apply -f manifests/07-extras.yaml
```
 
---
 
## Bước 3 — Xác minh hệ thống
 
### Kiểm tra tổng thể
```bash
kubectl get all -n k8s-platform-lab
```
 
Output mong đợi:
```
NAME                         READY   STATUS    RESTARTS   AGE
pod/redis-0                  1/1     Running   0          Xm
pod/relay-xxx-yyy             1/1     Running   0          Xm
pod/relay-xxx-zzz             1/1     Running   0          Xm
 
NAME                    TYPE        CLUSTER-IP     PORT(S)
service/redis           ClusterIP   10.x.x.x       6379/TCP
service/redis-headless  ClusterIP   None           6379/TCP
service/relay-service   ClusterIP   10.x.x.x       80/TCP
 
NAME                    READY   UP-TO-DATE   AVAILABLE
deployment.apps/relay   2/2     2            2
 
NAME                             READY
statefulset.apps/redis           1/1
```
 
### Kiểm tra từng yêu cầu
 
```bash
# 1. ServiceAccount tồn tại
kubectl get sa -n k8s-platform-lab
# → thấy relay-sa
 
# 2. RBAC hoạt động
kubectl auth can-i get events \
  --as=system:serviceaccount:k8s-platform-lab:relay-sa \
  -n k8s-platform-lab
# → yes
 
# 3. HPA đọc được metrics
# Cần chờ ~3 phút sau khi bật metrics-server
kubectl get hpa -n k8s-platform-lab
# → cpu: X%/50% (KHÔNG phải <unknown>)
# Nếu vẫn <unknown>: kubectl describe hpa relay-hpa -n k8s-platform-lab
 
# 4. Redis StatefulSet running
kubectl get sts -n k8s-platform-lab
# → 1/1
 
# 5. Redis có PriorityClass
kubectl describe pod redis-0 -n k8s-platform-lab | grep -i priority
# → Priority: 1000000
# → PriorityClassName: critical-data
 
# 6. PVC đã Bound
kubectl get pvc -n k8s-platform-lab
# → STATUS: Bound
 
# 7. PDB tồn tại
kubectl get pdb -n k8s-platform-lab
# → ALLOWED DISRUPTIONS: 1
```
 
### Kiểm tra NetworkPolicy
 
```bash
# Tạo Pod không có label app:relay
kubectl run intruder --image=busybox:1.36 -n k8s-platform-lab -- sleep 3600
kubectl wait pod intruder -n k8s-platform-lab --for=condition=Ready --timeout=30s
 
# Test kết nối vào Redis — phải bị BLOCK
kubectl exec -n k8s-platform-lab intruder -- \
  nc -zv redis-0.redis-headless.k8s-platform-lab.svc.cluster.local 6379 -w 3
# → timeout hoặc connection refused ✅
 
# Cleanup
kubectl delete pod intruder -n k8s-platform-lab
```
 
> **Lưu ý:** Nếu kết nối vẫn `open`, kiểm tra CNI:
> ```bash
> kubectl get pods -n kube-system | grep calico
> ```
> Nếu không thấy calico pods, phải tạo lại minikube với `--cni=calico`.
 
### Kiểm tra ứng dụng hoạt động end-to-end
 
```bash
# Port-forward để test từ máy local
kubectl port-forward svc/relay-service 3000:80 -n k8s-platform-lab &
 
# Health check
curl http://localhost:3000/health
# → {"status":"ok","info":{"redis":{"status":"up"}}}
 
# Ping Redis qua relay
curl http://localhost:3000/redis/ping
# → {"pong":"PONG"}
 
# Set cache
curl -X POST http://localhost:3000/redis/testkey \
  -H "Content-Type: application/json" \
  -d '{"value":"hello-k8s"}'
# → {"ok":true,"key":"testkey","value":"hello-k8s"}
 
# Get cache
curl http://localhost:3000/redis/testkey
# → {"key":"testkey","value":"hello-k8s"}
```
 
---
 
## Troubleshooting
 
### HPA hiển thị `<unknown>`
 
```bash
# Bước 1: Kiểm tra metrics-server
kubectl get pods -n kube-system | grep metrics-server
# Nếu không thấy: minikube addons enable metrics-server
 
# Bước 2: Kiểm tra Pod có chạy không
kubectl get pods -n k8s-platform-lab
# Nếu ImagePullBackOff: xem mục "ImagePullBackOff" bên dưới
 
# Bước 3: Kiểm tra resources.requests
kubectl describe deployment relay -n k8s-platform-lab | grep -A3 Requests
# Phải thấy cpu: 100m
 
# Bước 4: Chờ thêm 3-5 phút, metrics-server cần thời gian scrape lần đầu
kubectl top pods -n k8s-platform-lab
```
 
### ImagePullBackOff
 
```bash
# Nguyên nhân: minikube không thấy local Docker image
 
# Giải pháp 1: Load image vào minikube
minikube image load relay:1.0.0
 
# Giải pháp 2: Thêm imagePullPolicy: Never vào manifest
# containers:
#   - name: relay
#     image: relay:1.0.0
#     imagePullPolicy: Never
 
kubectl apply -f manifests/02-backend.yaml
```
 
### NetworkPolicy không block traffic
 
```bash
# Kiểm tra CNI
kubectl get pods -n kube-system | grep -E "calico|cilium|flannel|kindnet"
 
# Nếu thấy kindnet (không hỗ trợ NetworkPolicy):
minikube delete
minikube start --cni=calico --driver=docker
```
 
### Redis không start được
 
```bash
# Xem logs
kubectl logs redis-0 -n k8s-platform-lab
 
# Kiểm tra Secret đã đúng chưa
kubectl get secret redis-secret -n k8s-platform-lab -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d
 
# Test kết nối trực tiếp
kubectl exec -it redis-0 -n k8s-platform-lab -- \
  redis-cli -a <password> ping
```
 
---
 
## Dọn dẹp
 
```bash
# Xóa toàn bộ resources trong namespace
kubectl delete namespace k8s-platform-lab
 
# Hoặc xóa từng file
kubectl delete -f manifests/
 
# Xóa cluster hoàn toàn
minikube delete
```
 
---
 
## Tham khảo
 
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Gateway API](https://gateway-api.sigs.k8s.io/)
- [Calico NetworkPolicy](https://docs.tigera.io/calico/latest/network-policy/)
- [NestJS Documentation](https://docs.nestjs.com/)
- [MAP.md](./MAP.md) — Bản đồ 26 Kind
- [DESIGN.md](./DESIGN.md) — Phân tích kiến trúc
 