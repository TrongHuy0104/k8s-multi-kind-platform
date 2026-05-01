# Bản đồ 80 Kind — k8s-multi-kind-platform
 
> Tài liệu này liệt kê 20+ Kubernetes Kind được sử dụng hoặc tham chiếu trong lab,
> phân theo 7 nhóm A–G. Mỗi Kind kèm mô tả ngắn, lý do sử dụng và ví dụ lệnh kiểm tra.
 
---
 
## Nhóm A — Workload (Chạy ứng dụng)
 
> Nhóm này trả lời câu hỏi: **"Ứng dụng chạy như thế nào?"**
 
| Kind | API Group | Dùng trong lab | Mô tả & Ví dụ/Command |
|------|-----------|---------------|-------|
| `Deployment` | `apps/v1` | ✅ Backend Relay | Quản lý stateless app, rolling update, rollback. Tạo và giám sát ReplicaSet bên dưới.<br>**Lệnh:** `kubectl rollout status deployment relay -n k8s-platform-lab` |
| `StatefulSet` | `apps/v1` | ✅ Redis | Quản lý stateful app. Pod có tên ổn định (`redis-0`), PVC được giữ lại khi Pod restart.<br>**Lệnh:** `kubectl scale sts redis --replicas=3 -n k8s-platform-lab` |
| `ReplicaSet` | `apps/v1` | ⚙️ Tự động tạo bởi Deployment | Đảm bảo số lượng Pod replicas. Không nên tạo tay — để Deployment quản lý.<br>**Lệnh:** `kubectl get rs -n k8s-platform-lab` |
| `HorizontalPodAutoscaler` | `autoscaling/v2` | ✅ relay-hpa | Tự động scale số Pod theo CPU/memory. Bắt buộc phải có `resources.requests`.<br>**Lệnh:** `kubectl get hpa relay-hpa -n k8s-platform-lab -w` |
| `DaemonSet` | `apps/v1` | 📖 Tham chiếu | Chạy đúng 1 Pod trên mỗi Node. Dùng cho log collector, monitoring agent.<br>**Lệnh:** `kubectl get ds -n kube-system` |
| `Job` | `batch/v1` | ✅ redis-backup (one-time) | Chạy tác vụ đến khi hoàn thành rồi dừng.<br>**Lệnh:** `kubectl wait --for=condition=complete job/manual-backup` |
| `CronJob` | `batch/v1` | ✅ redis-backup (định kỳ) | Tạo Job theo lịch cron. Dùng cho backup, cleanup log định kỳ.<br>**Lệnh:** `kubectl create job --from=cronjob/redis-backup manual-backup -n k8s-platform-lab` |
 
---
 
## Nhóm B — Storage (Lưu trữ bền vững)
 
> Nhóm này trả lời câu hỏi: **"Data ở đâu và tồn tại bao lâu?"**
 
| Kind | API Group | Dùng trong lab | Mô tả & Ví dụ/Command |
|------|-----------|---------------|-------|
| `PersistentVolume` | `v1` | ⚙️ Tự động tạo bởi StorageClass | Đại diện cho một đơn vị storage thực tế.<br>**Lệnh:** `kubectl get pv` |
| `PersistentVolumeClaim` | `v1` | ✅ redis-data | Yêu cầu storage từ PV. PVC ở trạng thái `Bound` là thành công.<br>**Lệnh:** `kubectl get pvc redis-data-redis-0 -n k8s-platform-lab` |
| `StorageClass` | `storage.k8s.io/v1` | ⚙️ standard | Định nghĩa loại storage và cách cấp phát động.<br>**Lệnh:** `kubectl get sc` |
| `VolumeSnapshot` | `snapshot.storage.k8s.io/v1` | 📖 Tham chiếu | Tạo snapshot tại một thời điểm của PVC.<br>**Lệnh:** `kubectl get volumesnapshot` |
| `ConfigMap` | `v1` | ✅ relay-config | Lưu cấu hình không nhạy cảm (host, port).<br>**Lệnh:** `kubectl describe cm relay-config -n k8s-platform-lab` |
| `Secret` | `v1` | ✅ redis-secret | Lưu thông tin nhạy cảm. Không commit lên git.<br>**Lệnh:** `kubectl get secret relay-secret -n k8s-platform-lab -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d` |
 
---
 
## Nhóm C — Networking (Kết nối mạng)
 
> Nhóm này trả lời câu hỏi: **"Traffic đi vào và ra như thế nào?"**
 
| Kind | API Group | Dùng trong lab | Mô tả & Ví dụ/Command |
|------|-----------|---------------|-------|
| `Service` (ClusterIP) | `v1` | ✅ relay-service | Expose Pod ra bên trong cluster qua IP ổn định.<br>**Lệnh:** `kubectl port-forward svc/relay-service 3000:80 -n k8s-platform-lab` |
| `Service` (Headless) | `v1` | ✅ redis-headless | Trả về IP trực tiếp của từng Pod thay vì load balance.<br>**Lệnh:** `kubectl exec -it relay-xxx -- nslookup redis-headless` |
| `Endpoints` | `v1` | ⚙️ Tự động | Lưu danh sách IP:Port của các Pod.<br>**Lệnh:** `kubectl get endpoints -n k8s-platform-lab` |
| `EndpointSlice` | `discovery.k8s.io/v1` | ⚙️ Tự động | Bản tối ưu của Endpoints cho cluster lớn.<br>**Lệnh:** `kubectl get endpointslice -n k8s-platform-lab` |
| `Ingress` | `networking.k8s.io/v1` | 📖 Thay thế | Route HTTP traffic (được thay bằng Gateway).<br>**Lệnh:** `kubectl get ingress` |
| `IngressClass` | `networking.k8s.io/v1` | 📖 Tham chiếu | Xác định controller Ingress. |
| `Gateway` | `gateway.networking.k8s.io/v1` | ✅ platform-gateway | Thay thế Ingress API, phân tách quản trị.<br>**Lệnh:** `kubectl get gateway -n k8s-platform-lab` |
| `HTTPRoute` | `gateway.networking.k8s.io/v1` | ✅ relay-route | Routing rule HTTP gắn vào Gateway.<br>**Lệnh:** `kubectl describe httproute relay-route -n k8s-platform-lab` |
| `NetworkPolicy` | `networking.k8s.io/v1` | ✅ default-deny-all | Firewall nội bộ giữa các Pod. Cần CNI (Calico).<br>**Lệnh:** `kubectl get netpol -n k8s-platform-lab` |
 
---
 
## Nhóm D — Policy (Chính sách vận hành)
 
> Nhóm này trả lời câu hỏi: **"Hệ thống được bảo vệ khỏi sự cố vận hành như thế nào?"**
 
| Kind | API Group | Dùng trong lab | Mô tả & Ví dụ/Command |
|------|-----------|---------------|-------|
| `PodDisruptionBudget` | `policy/v1` | ✅ relay-pdb | Đảm bảo luôn có tối thiểu Pod chạy khi node bảo trì.<br>**Lệnh:** `kubectl get pdb relay-pdb -n k8s-platform-lab` |
| `PriorityClass` | `scheduling.k8s.io/v1` | ✅ critical-data | Quyết định Pod nào bị xóa khi node thiếu RAM.<br>**Lệnh:** `kubectl get priorityclass critical-data` |
| `LimitRange` | `v1` | 📖 Tham chiếu | Đặt mặc định Resource cho Pod trong Namespace.<br>**Lệnh:** `kubectl describe limitrange -n default` |
| `ResourceQuota` | `v1` | 📖 Tham chiếu | Giới hạn tổng tài nguyên của Namespace.<br>**Lệnh:** `kubectl get quota -n k8s-platform-lab` |
| `RuntimeClass` | `node.k8s.io/v1` | 📖 Tham chiếu | Chọn container runtime (gVisor, Kata). |
 
---
 
## Nhóm E — RBAC (Phân quyền)
 
> Nhóm này trả lời câu hỏi: **"Ai được làm gì trong cluster?"**
 
| Kind | API Group | Dùng trong lab | Mô tả & Ví dụ/Command |
|------|-----------|---------------|-------|
| `ServiceAccount` | `v1` | ✅ relay-sa | Định danh cho Pod khi gọi K8s API.<br>**Lệnh:** `kubectl get sa relay-sa -n k8s-platform-lab` |
| `Role` | `rbac.authorization.k8s.io/v1` | ✅ relay-event-reader | Tập quyền trong Namespace.<br>**Lệnh:** `kubectl describe role relay-event-reader -n k8s-platform-lab` |
| `RoleBinding` | `rbac.authorization.k8s.io/v1` | ✅ relay-event-binding | Gắn Role cho ServiceAccount.<br>**Lệnh:** `kubectl get rolebinding -n k8s-platform-lab` |
| `ClusterRole` | `rbac.authorization.k8s.io/v1` | 📖 Tham chiếu | Quyền áp dụng toàn Cluster.<br>**Lệnh:** `kubectl get clusterrole` |
| `ClusterRoleBinding` | `rbac.authorization.k8s.io/v1` | 📖 Tham chiếu | Gắn ClusterRole toàn Cluster.<br>**Lệnh:** `kubectl get clusterrolebinding` |
 
**Kiểm tra quyền:**
```bash
kubectl auth can-i get events \
  --as=system:serviceaccount:k8s-platform-lab:relay-sa \
  -n k8s-platform-lab
# Kết quả: yes
```
 
---
 
## Nhóm F — Meta (Quản trị & Quan sát)
 
> Nhóm này trả lời câu hỏi: **"Cluster được tổ chức và quan sát như thế nào?"**
 
| Kind | API Group | Dùng trong lab | Mô tả & Ví dụ/Command |
|------|-----------|---------------|-------|
| `Namespace` | `v1` | ✅ k8s-platform-lab | Cô lập tài nguyên.<br>**Lệnh:** `kubectl get ns k8s-platform-lab` |
| `Node` | `v1` | 📖 Quan sát | Máy chủ trong cluster.<br>**Lệnh:** `kubectl get nodes -o wide` |
| `Event` | `v1` | ✅ relay-sa có quyền | Sự kiện hệ thống.<br>**Lệnh:** `kubectl get events -n k8s-platform-lab --sort-by='.metadata.creationTimestamp'` |
| `CustomResourceDefinition` | `apiextensions.../v1` | ✅ StarCiApp CRD | Mở rộng API.<br>**Lệnh:** `kubectl get crd starciapps.platform.lab` |
| `MutatingWebhookConfiguration` | `admission.../v1` | 📖 Tham chiếu | Inject sidecar tự động. |
| `ValidatingWebhookConfiguration` | `admission.../v1` | 📖 Tham chiếu | Validate resource trước khi lưu. |
 
---
 
## Nhóm G — Map tổng hợp
 
> Quan hệ phụ thuộc giữa các Kind trong lab này:
 
```
[Namespace]
    │
    ├── [ServiceAccount: relay-sa]
    │       └── [Role] ←── [RoleBinding]
    │
    ├── [ConfigMap: relay-config]
    ├── [Secret: redis-secret]
    │
    ├── [PriorityClass: critical-data]
    │
    ├── [StatefulSet: redis]
    │       ├── uses → [Secret] (password)
    │       ├── uses → [PriorityClass]
    │       ├── creates → [Pod: redis-0]
    │       └── creates → [PVC: redis-data-redis-0]
    │               └── binds → [PV] (từ StorageClass)
    │
    ├── [Service: redis-headless] ←── DNS cho redis-0
    ├── [Service: redis] ←── ClusterIP cho admin
    │
    ├── [Deployment: relay]
    │       ├── uses → [ServiceAccount: relay-sa]
    │       ├── uses → [ConfigMap] + [Secret]
    │       ├── creates → [ReplicaSet]
    │       │       └── creates → [Pod: relay-xxx] × 2
    │       └── scaled by → [HPA: relay-hpa]
    │
    ├── [Service: relay-service] ←── ClusterIP cho relay
    │       └── auto-creates → [EndpointSlice]
    │
    ├── [Gateway: platform-gateway]
    │       └── routes via → [HTTPRoute: relay-route] → [Service: relay-service]
    │
    ├── [PodDisruptionBudget: relay-pdb] ←── bảo vệ Deployment/relay
    │
    ├── [NetworkPolicy: default-deny-all]
    ├── [NetworkPolicy: allow-relay-to-redis]
    ├── [NetworkPolicy: allow-gateway-to-relay]
    │
    └── [CronJob: redis-backup]
            └── creates → [Job] → [Pod] (label: app=relay để qua NetworkPolicy)
```
 
---
 
## Bảng tổng hợp 26 Kind
 
| # | Kind | Nhóm | Trạng thái trong lab |
|---|------|-------|---------------------|
| 1 | Namespace | F | ✅ Triển khai |
| 2 | ServiceAccount | E | ✅ Triển khai |
| 3 | Role | E | ✅ Triển khai |
| 4 | RoleBinding | E | ✅ Triển khai |
| 5 | ConfigMap | B | ✅ Triển khai |
| 6 | Secret | B | ✅ Triển khai |
| 7 | PriorityClass | D | ✅ Triển khai |
| 8 | StatefulSet | A | ✅ Triển khai |
| 9 | PersistentVolumeClaim | B | ✅ Triển khai (auto) |
| 10 | PersistentVolume | B | ✅ Triển khai (auto) |
| 11 | StorageClass | B | ✅ Dùng mặc định |
| 12 | Service (Headless) | C | ✅ Triển khai |
| 13 | Service (ClusterIP) | C | ✅ Triển khai |
| 14 | Deployment | A | ✅ Triển khai |
| 15 | ReplicaSet | A | ✅ Triển khai (auto) |
| 16 | HorizontalPodAutoscaler | A | ✅ Triển khai |
| 17 | EndpointSlice | C | ✅ Triển khai (auto) |
| 18 | Gateway | C | ✅ Triển khai |
| 19 | HTTPRoute | C | ✅ Triển khai |
| 20 | NetworkPolicy | C | ✅ Triển khai |
| 21 | PodDisruptionBudget | D | ✅ Triển khai |
| 22 | CronJob | A | ✅ Triển khai |
| 23 | Job | A | ✅ Triển khai (auto) |
| 24 | Event | F | ✅ Quan sát |
| 25 | CustomResourceDefinition | F | ✅ Triển khai |
| 26 | Node | F | ✅ Quan sát |
 
---
 
*Ghi chú: ✅ = có trong lab | ⚙️ = tự động tạo | 📖 = tham chiếu/tài liệu*
 