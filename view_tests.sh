docker exec -i phantesta_tests bash -c "x11vnc -display :50" &
sleep 3;
vinagre `docker inspect phantesta_tests | grep '"IPAddress"' | head -n 1 | awk 'BEGIN{FS="\""}{print $4}'`:5900;
